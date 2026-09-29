import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

/*
 * The admin activity trail (AuditLog): who changed what, in one plain sentence.
 * Orders and stock keep their own trails (OrderEvent, InventoryAdjustment, both
 * with actorId); this covers everything else — products, prices, collections,
 * discounts, reviews, settings, roles.
 *
 * Never put secrets, tokens, full card or bank details in `summary` or `metadata`.
 */

export interface RecordAuditInput {
  /** The acting admin's id; null for command-line changes. */
  actorId: string | null;
  /** Dotted verb: "product.update", "coupon.create", "review.approve". */
  action: string;
  /** The model name: "Product", "Coupon", "Review", "User". */
  entityType: string;
  entityId?: string | null;
  /** One sentence for the activity list: "Changed the price of Linen Shirt from ₦45,000 to ₦42,000." */
  summary: string;
  /** Small structured detail, e.g. { before: { price }, after: { price } }. */
  metadata?: Prisma.InputJsonValue;
  /** Record inside this transaction, so the entry commits (or rolls back) with the change. */
  tx?: Prisma.TransactionClient;
}

const MAX_SUMMARY = 500;
const MAX_ACTION = 64;

/**
 * Writes one audit entry.
 *
 * - With `tx`: written in that transaction and errors are thrown, so a change is
 *   never committed without its audit entry (the whole transaction rolls back).
 * - Without `tx`: best effort. Failures are logged server-side and swallowed, so
 *   a change that has already been saved is never reported to the admin as failed
 *   just because its log line couldn't be written.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    actorId: input.actorId,
    action: input.action.slice(0, MAX_ACTION),
    entityType: input.entityType.slice(0, MAX_ACTION),
    entityId: input.entityId ?? null,
    summary: input.summary.trim().slice(0, MAX_SUMMARY),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };

  if (input.tx) {
    await input.tx.auditLog.create({ data, select: { id: true } });
    return;
  }

  try {
    await getDb().auditLog.create({ data, select: { id: true } });
  } catch (error) {
    console.error(
      `[admin] could not record audit entry ${data.action} for ${data.entityType}${data.entityId ? ` ${data.entityId}` : ""}`,
      error instanceof Error ? error.message : error,
    );
  }
}
