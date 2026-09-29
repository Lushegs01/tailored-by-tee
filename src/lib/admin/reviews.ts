import "server-only";

import {
  DELETE_AUDIT_ACTION,
  MODERATION_STEPS,
  deletionAuditSummary,
  groupReviewsByStatus,
  moderationAuditSummary,
  planModeration,
  reviewFilterWhere,
  reviewLabel,
  reviewOrderBy,
  reviewTabCounts,
  reviewTabWhere,
  type ReviewListQuery,
  type ReviewRef,
  type ReviewStatusValue,
  type ReviewTabCounts,
} from "@/components/admin/reviews/review-rules";
import { Prisma } from "@/generated/prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";

import { recordAudit } from "./audit";
import { PAGE_SIZE, lastPage, pageOffset } from "./pagination";

/*
 * Review moderation: reading the review list for /admin/reviews, moving reviews
 * between "waiting for approval", "published" and "rejected", and deleting spam.
 *
 * Every change is a conditional write on the status the admin saw (two admins,
 * or a later customer-facing process, can never silently overwrite each other),
 * committed together with its audit entry naming the acting admin. The customer's
 * words are never edited here.
 *
 * The storefront's cached catalogue holds no reviews (product pages don't show
 * them yet, Phase 10), so moderation doesn't expire it; see the actions for what
 * is refreshed instead.
 */

const TRANSACTION = { maxWait: 5_000, timeout: 10_000 } as const;

/* ── Reading ───────────────────────────────────────────────────────────── */

export interface AdminReviewRow {
  id: string;
  status: ReviewStatusValue;
  rating: number;
  title: string;
  body: string;
  displayName: string;
  isDemo: boolean;
  isVerifiedPurchase: boolean;
  createdAt: Date;
  moderatedAt: Date | null;
  moderator: { id: string; name: string | null; email: string } | null;
  /** The reviewer's account, when they were signed in. For moderation only — never shown publicly. */
  customer: { id: string; email: string } | null;
  /** The order the review is linked to, when there is one. */
  orderNumber: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    image: { url: string; alt: string; color: string } | null;
  };
}

export type ReviewsLoad =
  | { ok: true; rows: AdminReviewRow[]; total: number; page: number; counts: ReviewTabCounts }
  | { ok: false; reason: "not_configured" | "failed" };

const REVIEW_ROW_SELECT = {
  id: true,
  status: true,
  rating: true,
  title: true,
  body: true,
  displayName: true,
  isDemo: true,
  isVerifiedPurchase: true,
  createdAt: true,
  moderatedAt: true,
  moderatedBy: { select: { id: true, name: true, email: true } },
  user: { select: { id: true, email: true } },
  order: { select: { number: true } },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      // The card photo: the first main image in photo order.
      images: {
        where: { role: "PRIMARY" },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        take: 1,
        select: { media: { select: { url: true, alt: true, color: true } } },
      },
    },
  },
} satisfies Prisma.ReviewSelect;

type ReviewRecord = Prisma.ReviewGetPayload<{ select: typeof REVIEW_ROW_SELECT }>;

function toRow(record: ReviewRecord): AdminReviewRow {
  const image = record.product.images[0]?.media ?? null;
  return {
    id: record.id,
    status: record.status,
    rating: record.rating,
    title: record.title,
    body: record.body,
    displayName: record.displayName,
    isDemo: record.isDemo,
    isVerifiedPurchase: record.isVerifiedPurchase,
    createdAt: record.createdAt,
    moderatedAt: record.moderatedAt,
    moderator: record.moderatedBy,
    customer: record.user,
    orderNumber: record.order?.number ?? null,
    product: {
      id: record.product.id,
      name: record.product.name,
      slug: record.product.slug,
      status: record.product.status,
      image: image ? { url: image.url, alt: image.alt, color: image.color } : null,
    },
  };
}

/**
 * One page of reviews for a tab, with every tab's count under the same search
 * and filters. A page past the end shows the last page instead.
 */
export async function listReviews(
  query: ReviewListQuery,
  pageSize: number = PAGE_SIZE,
): Promise<ReviewsLoad> {
  if (!isDatabaseConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const db = getDb();
    const filterWhere = reviewFilterWhere(query);

    const groups = await db.review.groupBy({
      by: ["status"],
      where: filterWhere,
      _count: { _all: true },
    });
    const counts = reviewTabCounts(
      groups.map((group) => ({ status: group.status, count: group._count._all })),
    );
    const total = counts[query.tab];
    const page = Math.min(query.page, lastPage(total, pageSize));

    const records =
      total === 0
        ? []
        : await db.review.findMany({
            where: { AND: [filterWhere, reviewTabWhere(query.tab)] },
            orderBy: reviewOrderBy(query),
            skip: pageOffset(page, pageSize),
            take: pageSize,
            select: REVIEW_ROW_SELECT,
          });

    return { ok: true, rows: records.map(toRow), total, page, counts };
  } catch (error) {
    console.error("[admin] could not read reviews", error instanceof Error ? error.message : error);
    return { ok: false, reason: "failed" };
  }
}

/** The product a "reviews of this product" link names, or null when it doesn't exist (or can't be read). */
export async function getReviewFilterProduct(
  productId: string,
): Promise<{ id: string; name: string } | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    return await getDb().product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
  } catch (error) {
    console.error(
      "[admin] could not read the review filter's product",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/* ── Moderating ────────────────────────────────────────────────────────── */

/** A review that was just moderated or deleted, with what the refresh and messages need. */
export interface ChangedReview {
  id: string;
  from: ReviewStatusValue;
  productSlug: string;
  /** "Ada’s review of Linen Shirt" */
  label: string;
}

/** The columns a write returns about each review it touched, before its product is named. */
interface WrittenReview {
  id: string;
  from: ReviewStatusValue;
  title: string;
  displayName: string;
  productId: string;
}

/**
 * Names each review's product in one lookup: the slug the refresh needs and the
 * label the messages and audit entry use. Deliberately a second query rather than
 * a relation read on the write itself, so both writes stay plain conditional SQL
 * over one table. A product that has gone (only possible for a review deleted in
 * the same breath as its product) leaves an empty slug, and reviewLabel falls
 * back to "a review of a product".
 */
async function nameProducts<T extends WrittenReview>(
  tx: Prisma.TransactionClient,
  rows: readonly T[],
): Promise<(T & { productSlug: string; label: string })[]> {
  if (rows.length === 0) return [];
  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.productId))] } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  return rows.map((row) => {
    const product = byId.get(row.productId);
    return { ...row, productSlug: product?.slug ?? "", label: reviewLabel(row.displayName, product?.name ?? "") };
  });
}

/** Just the fields the browser and the refresh need, without the audit detail. */
function toChangedReview(review: ChangedReview): ChangedReview {
  return { id: review.id, from: review.from, productSlug: review.productSlug, label: review.label };
}

export interface SetReviewStatusResult {
  changed: ChangedReview[];
  /** Already in the target status. */
  unchanged: number;
  /** Changed by someone else since the admin's page loaded. */
  stale: number;
}

/**
 * Moves reviews to `to`, each only if it's still in the status the admin saw
 * (one conditional update per status, in one transaction), setting who
 * moderated it and when. The audit entry commits with the change.
 */
export async function setReviewStatus(input: {
  reviews: readonly ReviewRef[];
  to: ReviewStatusValue;
  actorId: string;
}): Promise<SetReviewStatusResult> {
  const { to, actorId } = input;
  const plan = planModeration(input.reviews, to);
  const requested = plan.groups.reduce((sum, group) => sum + group.ids.length, 0);
  if (requested === 0) return { changed: [], unchanged: plan.unchanged.length, stale: 0 };

  return getDb().$transaction(async (tx) => {
    const now = new Date();
    const written: WrittenReview[] = [];

    // One conditional UPDATE per status the admin saw: a review someone else has
    // already moved no longer matches, so it is left exactly as it now is.
    for (const group of plan.groups) {
      const rows = await tx.review.updateManyAndReturn({
        where: { id: { in: group.ids }, status: group.from },
        data: { status: to, moderatedAt: now, moderatedById: actorId },
        select: { id: true, title: true, displayName: true, productId: true },
      });
      for (const row of rows) written.push({ ...row, from: group.from });
    }

    const changed = await nameProducts(tx, written);

    if (changed.length > 0) {
      const single = changed.length === 1 ? changed[0] : null;
      await recordAudit({
        tx,
        actorId,
        action: MODERATION_STEPS[to].auditAction,
        entityType: "Review",
        entityId: single?.id ?? null,
        summary: moderationAuditSummary(to, changed),
        metadata: {
          to,
          count: changed.length,
          reviews: changed.map((review) => ({ id: review.id, from: review.from })),
        },
      });
    }

    return {
      changed: changed.map(toChangedReview),
      unchanged: plan.unchanged.length,
      stale: requested - changed.length,
    };
  }, TRANSACTION);
}

export interface DeleteReviewsResult {
  deleted: ChangedReview[];
  stale: number;
}

interface DeletedRow {
  id: string;
  productId: string;
  status: ReviewStatusValue;
  title: string;
  displayName: string;
  rating: number;
  isDemo: boolean;
}

/**
 * Permanently deletes reviews (spam, abuse), each only if it's still in the
 * status the admin saw — one DELETE … RETURNING, so exactly the rows removed are
 * reported and audited. The audit entry keeps the rating, title and name, never
 * the text.
 */
export async function deleteReviewsById(input: {
  reviews: readonly ReviewRef[];
  actorId: string;
}): Promise<DeleteReviewsResult> {
  const groups = groupReviewsByStatus(input.reviews);
  const requested = groups.reduce((sum, group) => sum + group.ids.length, 0);
  if (requested === 0) return { deleted: [], stale: 0 };

  const conditions = groups.map(
    (group) => Prisma.sql`("id" IN (${Prisma.join(group.ids)}) AND "status" = ${group.from}::"ReviewStatus")`,
  );

  return getDb().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<DeletedRow[]>`
      DELETE FROM "Review"
      WHERE ${Prisma.join(conditions, " OR ")}
      RETURNING "id", "productId", "status"::text AS "status", "title", "displayName", "rating", "isDemo"`;

    if (rows.length === 0) return { deleted: [], stale: requested };

    const deleted = await nameProducts(
      tx,
      rows.map((row) => ({
        id: row.id,
        from: row.status,
        title: row.title,
        displayName: row.displayName,
        productId: row.productId,
        rating: Number(row.rating),
        isDemo: row.isDemo,
      })),
    );

    const single = deleted.length === 1 ? deleted[0] : null;
    await recordAudit({
      tx,
      actorId: input.actorId,
      action: DELETE_AUDIT_ACTION,
      entityType: "Review",
      entityId: single?.id ?? null,
      summary: deletionAuditSummary(deleted),
      metadata: {
        count: deleted.length,
        reviews: deleted.map((review) => ({
          id: review.id,
          productId: review.productId,
          status: review.from,
          rating: review.rating,
          isDemo: review.isDemo,
        })),
      },
    });

    return { deleted: deleted.map(toChangedReview), stale: requested - deleted.length };
  }, TRANSACTION);
}

/** The database is missing a table or column this code expects (the admin migration hasn't been applied). */
export function isMissingSchemaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}
