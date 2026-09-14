import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getCatalogSource } from "@/lib/catalog/sources";
import { getDb } from "@/lib/db";

/*
 * Stock held for unpaid orders.
 *
 * Holding is one conditional UPDATE per line — "add to reserved only if enough is
 * free right now" — so two shoppers can never both take the last piece: the
 * second update waits for the first, re-checks the condition, and matches no row.
 * The database's CHECK constraint (reserved ≤ onHand) backs this up.
 *
 * Releasing is claimed by a conditional status change (PENDING → CANCELLED), so an
 * order's stock is returned exactly once, however many sweeps race for it.
 */

/** Holds `quantity` units of a variant. False when that many are not free at this instant. */
export async function reserveStock(tx: Prisma.TransactionClient, variantId: string, quantity: number): Promise<boolean> {
  const affected = await tx.$executeRaw`
    UPDATE "Inventory"
    SET "reserved" = "reserved" + ${quantity}, "updatedAt" = NOW()
    WHERE "variantId" = ${variantId} AND "onHand" - "reserved" >= ${quantity}`;
  return affected === 1;
}

async function releaseStock(tx: Prisma.TransactionClient, variantId: string, quantity: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Inventory"
    SET "reserved" = GREATEST("reserved" - ${quantity}, 0), "updatedAt" = NOW()
    WHERE "variantId" = ${variantId}`;
}

const RELEASE_NOTES = {
  expired: "The payment window closed; stock returned.",
  superseded: "Replaced by a newer checkout; stock returned.",
  cancelled: "Cancelled; stock returned.",
} as const;

export type ReleaseReason = keyof typeof RELEASE_NOTES;

/** Cancels an unpaid order and returns its stock and discount-code use. False if it was already settled. */
export async function releaseOrder(orderId: string, reason: ReleaseReason): Promise<boolean> {
  return getDb().$transaction(
    async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING", paymentStatus: { notIn: ["SUCCESS", "REFUNDED"] } },
        data: { status: "CANCELLED", paymentStatus: "ABANDONED", cancelledAt: new Date(), reservedUntil: null },
      });
      if (claimed.count === 0) return false;

      const held = (
        await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } })
      ).flatMap((item) => (item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : []));

      for (const item of held) await releaseStock(tx, item.variantId, item.quantity);
      if (held.length > 0) {
        await tx.inventoryAdjustment.createMany({
          data: held.map((item) => ({
            variantId: item.variantId,
            reservedDelta: -item.quantity,
            reason: "ORDER_RELEASED" as const,
            orderId,
            note: RELEASE_NOTES[reason],
          })),
        });
      }

      const usage = await tx.couponUsage.findUnique({ where: { orderId }, select: { couponId: true } });
      if (usage) {
        await tx.couponUsage.delete({ where: { orderId } });
        await tx.$executeRaw`
          UPDATE "Coupon" SET "usageCount" = GREATEST("usageCount" - 1, 0), "updatedAt" = NOW()
          WHERE "id" = ${usage.couponId}`;
      }

      await tx.orderEvent.create({
        data: { orderId, type: "order_released", fromStatus: "PENDING", toStatus: "CANCELLED", note: RELEASE_NOTES[reason] },
      });
      return true;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Releases lapsed holds at most once a minute per server instance. Called after
 * bag and checkout responses (via `after()`), so abandoned checkouts go back on
 * sale soon after any shopper activity — without adding a moment to anyone's request.
 */
export async function sweepExpiredReservations(now = new Date()): Promise<void> {
  if (getCatalogSource() !== "database" || now.getTime() - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now.getTime();
  try {
    const released = await releaseExpiredReservations(now);
    if (released > 0) console.info(`[reservations] released ${released} lapsed hold(s)`);
  } catch (error) {
    console.error("[reservations] sweep failed", error instanceof Error ? error.message : error);
  }
}

/** Releases unpaid orders whose hold has lapsed. Cheap when there are none (indexed on status + reservedUntil). */
export async function releaseExpiredReservations(now = new Date(), limit = 25): Promise<number> {
  const expired = await getDb().order.findMany({
    where: { status: "PENDING", reservedUntil: { lt: now } },
    select: { id: true },
    orderBy: { reservedUntil: "asc" },
    take: limit,
  });

  let released = 0;
  for (const { id } of expired) if (await releaseOrder(id, "expired")) released++;
  return released;
}
