import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import {
  ACTIVITY_DETAIL_TYPES,
  activityEntityKey,
  auditEntityHref,
  type ActivityLinkLookups,
} from "./settings";

/*
 * The admin team: who has admin access, giving and removing it, and the recent
 * activity trail shown on the settings page.
 *
 * Roles are read from the database on every request, so a change here takes
 * effect on the person's next click. Two rules hold even when two admins act at
 * the same moment:
 * - nobody removes their own access, and the last admin can't be removed;
 * - a change is only made by someone who is still an admin when it commits.
 * Both are enforced inside the transaction with row locks, not by an earlier
 * read. Every change commits together with its audit entry, or not at all.
 */

const TRANSACTION = { maxWait: 5_000, timeout: 10_000 } as const;

/** The database is missing a table or column this code expects (the admin migration hasn't been applied). */
export function isMissingSchemaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")
  );
}

export type TeamReadResult<T> = { ok: true; data: T } | { ok: false; reason: "needs_migration" | "unavailable" };

function readFailure(key: string, error: unknown): { ok: false; reason: "needs_migration" | "unavailable" } {
  if (isMissingSchemaError(error)) return { ok: false, reason: "needs_migration" };
  console.error(`[admin] could not read ${key}`, error instanceof Error ? error.message : error);
  return { ok: false, reason: "unavailable" };
}

/* ── Team ───────────────────────────────────────────────────────────────── */

export interface AdminTeamMember {
  id: string;
  email: string;
  name: string | null;
  /** A demo account (npm run db:seed:demo): should never keep admin access on the live store. */
  isDemo: boolean;
  /** When they were last given admin access, or when their account was created if that wasn't recorded. */
  adminSince: Date;
  adminSinceSource: "granted" | "account";
  /** False for someone given access by email who hasn't signed in yet. */
  hasSignedIn: boolean;
}

const MAX_ADMINS_LISTED = 200;

/** Everyone with admin access, longest-serving first. */
export async function listAdminTeam(): Promise<TeamReadResult<AdminTeamMember[]>> {
  try {
    const db = getDb();
    const users = await db.user.findMany({
      where: { role: "ADMIN" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MAX_ADMINS_LISTED,
      select: {
        id: true,
        email: true,
        name: true,
        isDemo: true,
        createdAt: true,
        emailVerified: true,
        _count: { select: { accounts: true, sessions: true } },
      },
    });

    const grants =
      users.length === 0
        ? []
        : await db.auditLog.findMany({
            where: { action: "admin.grant", entityType: "User", entityId: { in: users.map((user) => user.id) } },
            orderBy: { createdAt: "desc" },
            select: { entityId: true, createdAt: true },
          });
    const latestGrant = new Map<string, Date>();
    for (const grant of grants) {
      if (grant.entityId && !latestGrant.has(grant.entityId)) latestGrant.set(grant.entityId, grant.createdAt);
    }

    const members = users.map((user): AdminTeamMember => {
      const granted = latestGrant.get(user.id);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isDemo: user.isDemo,
        adminSince: granted ?? user.createdAt,
        adminSinceSource: granted ? "granted" : "account",
        hasSignedIn: user.emailVerified !== null || user._count.accounts > 0 || user._count.sessions > 0,
      };
    });
    members.sort((a, b) => a.adminSince.getTime() - b.adminSince.getTime());
    return { ok: true, data: members };
  } catch (error) {
    return readFailure("the admin team", error);
  }
}

export type GrantAdminOutcome =
  | { ok: true; userId: string; email: string; createdAccount: boolean }
  | { ok: false; reason: "already_admin" | "actor_not_admin" };

/**
 * Gives admin access to `email` (already lower-case and validated). Promotes an
 * existing customer account, or creates the account with the admin role so the
 * person's first sign-in with that address lands in the admin area.
 */
export async function grantAdminRole(input: { email: string; actorId: string }): Promise<GrantAdminOutcome> {
  const { email, actorId } = input;

  // A sign-up for the same address at the same moment makes the create fail on
  // the unique email; the second attempt then finds and promotes that account.
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().$transaction(async (tx): Promise<GrantAdminOutcome> => {
        // The acting admin must still be one; FOR SHARE makes a concurrent removal of their access wait for this.
        const actor = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "User" WHERE "id" = ${actorId} AND "role" = 'ADMIN' FOR SHARE`;
        if (actor.length === 0) return { ok: false, reason: "actor_not_admin" };

        // Conditional update: only a customer account is promoted, so two grants can't both claim it.
        const promoted = await tx.user.updateManyAndReturn({
          where: { email, role: "CUSTOMER" },
          data: { role: "ADMIN" },
          select: { id: true },
        });

        let userId: string;
        let createdAccount = false;
        if (promoted.length > 0) {
          userId = promoted[0].id;
        } else {
          const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
          if (existing) return { ok: false, reason: "already_admin" };
          const created = await tx.user.create({ data: { email, role: "ADMIN" }, select: { id: true } });
          userId = created.id;
          createdAccount = true;
        }

        await recordAudit({
          tx,
          actorId,
          action: "admin.grant",
          entityType: "User",
          entityId: userId,
          summary: createdAccount
            ? `Gave admin access to ${email} (a new account was created for this address).`
            : `Gave admin access to ${email}.`,
          metadata: { email, createdAccount, previousRole: createdAccount ? null : "CUSTOMER" },
        });

        return { ok: true, userId, email, createdAccount };
      }, TRANSACTION);
    } catch (error) {
      const uniqueClash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (uniqueClash && attempt === 0) continue;
      throw error;
    }
  }
}

export type RevokeAdminOutcome =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "self" | "not_admin" | "last_admin" | "actor_not_admin" };

/**
 * Removes admin access from `userId`, keeping their customer account. Refuses to
 * remove the actor's own access or the last admin's.
 */
export async function revokeAdminRole(input: { userId: string; actorId: string }): Promise<RevokeAdminOutcome> {
  const { userId, actorId } = input;
  if (userId === actorId) return { ok: false, reason: "self" };

  return getDb().$transaction(async (tx): Promise<RevokeAdminOutcome> => {
    // Lock every admin row, in a fixed order, before deciding. A second removal
    // running at the same time waits here, then sees the first one's result, so
    // two admins removing each other can never leave the store with none.
    // (NO KEY UPDATE rather than UPDATE: it doesn't wait on other admins' writes
    // that merely reference their own user row, like stock adjustments.)
    const admins = await tx.$queryRaw<{ id: string; email: string }[]>`
      SELECT "id", "email" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "id" FOR NO KEY UPDATE`;

    if (!admins.some((admin) => admin.id === actorId)) return { ok: false, reason: "actor_not_admin" };
    const target = admins.find((admin) => admin.id === userId);
    if (!target) return { ok: false, reason: "not_admin" };
    if (admins.length <= 1) return { ok: false, reason: "last_admin" };

    const changed = await tx.user.updateMany({ where: { id: userId, role: "ADMIN" }, data: { role: "CUSTOMER" } });
    if (changed.count !== 1) return { ok: false, reason: "not_admin" };

    await recordAudit({
      tx,
      actorId,
      action: "admin.revoke",
      entityType: "User",
      entityId: userId,
      summary: `Removed admin access from ${target.email}.`,
      metadata: { email: target.email, remainingAdmins: admins.length - 1 },
    });

    return { ok: true, userId, email: target.email };
  }, TRANSACTION);
}

/* ── Activity ───────────────────────────────────────────────────────────── */

export interface ActivityEntry {
  id: string;
  createdAt: Date;
  /** Null for command-line changes (npm run admin:grant) and for admins whose account has since been deleted. */
  actor: { email: string; name: string | null } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  /** The admin page for what changed, when it still exists (see auditEntityHref). */
  href: string | null;
}

export const RECENT_ACTIVITY_LIMIT = 50;

/** The latest admin changes, newest first, each with a link to what changed where there is one. */
export async function listRecentActivity(limit = RECENT_ACTIVITY_LIMIT): Promise<TeamReadResult<ActivityEntry[]>> {
  const take = Math.min(Math.max(1, Math.trunc(limit) || RECENT_ACTIVITY_LIMIT), 200);
  try {
    const rows = await getDb().auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        metadata: true,
        actor: { select: { email: true, name: true } },
      },
    });

    const lookups = await lookUpActivityRecords(rows);
    return {
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        actor: row.actor,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
        href: auditEntityHref(row, lookups ?? undefined),
      })),
    };
  } catch (error) {
    return readFailure("recent activity", error);
  }
}

/**
 * Finds the records an activity list mentions, in one small query per kind, so
 * links only point at things that still exist and orders link by their number.
 * Null when a lookup fails; links then fall back to each entry's own metadata.
 */
async function lookUpActivityRecords(
  rows: readonly { entityType: string; entityId: string | null }[],
): Promise<ActivityLinkLookups | null> {
  const idsOf = (...types: string[]) => [
    ...new Set(
      rows
        .filter((row) => row.entityId && types.includes(row.entityType))
        .map((row) => row.entityId as string),
    ),
  ];

  const orderRefs = idsOf("Order");
  const refundIds = idsOf("Refund");
  const variantIds = idsOf("ProductVariant", "Inventory");
  const imageIds = idsOf("ProductImage");
  const detailIds = new Map(ACTIVITY_DETAIL_TYPES.map((type) => [type, idsOf(type)] as const));

  const none = Promise.resolve([] as never[]);
  const db = getDb();

  try {
    const [orders, refunds, variants, images, products, collections, categories, coupons, users] = await Promise.all([
      orderRefs.length
        ? db.order.findMany({
            where: { OR: [{ id: { in: orderRefs } }, { number: { in: orderRefs } }] },
            select: { id: true, number: true },
          })
        : none,
      refundIds.length
        ? db.refund.findMany({ where: { id: { in: refundIds } }, select: { id: true, order: { select: { number: true } } } })
        : none,
      variantIds.length
        ? db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, productId: true } })
        : none,
      imageIds.length
        ? db.productImage.findMany({ where: { id: { in: imageIds } }, select: { id: true, productId: true } })
        : none,
      existingIds(detailIds.get("Product"), (ids) =>
        db.product.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      ),
      existingIds(detailIds.get("Collection"), (ids) =>
        db.collection.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      ),
      existingIds(detailIds.get("Category"), (ids) =>
        db.category.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      ),
      existingIds(detailIds.get("Coupon"), (ids) =>
        db.coupon.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      ),
      existingIds(detailIds.get("User"), (ids) => db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })),
    ]);

    const orderNumbers = new Map<string, string>();
    for (const order of orders) {
      orderNumbers.set(activityEntityKey("Order", order.id), order.number);
      orderNumbers.set(activityEntityKey("Order", order.number), order.number);
    }
    for (const refund of refunds) orderNumbers.set(activityEntityKey("Refund", refund.id), refund.order.number);

    const productIds = new Map<string, string>();
    for (const variant of variants) {
      productIds.set(activityEntityKey("ProductVariant", variant.id), variant.productId);
      productIds.set(activityEntityKey("Inventory", variant.id), variant.productId);
    }
    for (const image of images) productIds.set(activityEntityKey("ProductImage", image.id), image.productId);

    const existing = new Set<string>();
    const found = { Product: products, Collection: collections, Category: categories, Coupon: coupons, User: users };
    for (const [type, records] of Object.entries(found)) {
      for (const record of records) existing.add(activityEntityKey(type, record.id));
    }

    return { orderNumbers, productIds, existing };
  } catch (error) {
    console.error("[admin] could not look up activity links", error instanceof Error ? error.message : error);
    return null;
  }
}

async function existingIds(
  ids: readonly string[] | undefined,
  find: (ids: string[]) => Promise<{ id: string }[]>,
): Promise<{ id: string }[]> {
  return ids && ids.length > 0 ? find([...ids]) : [];
}
