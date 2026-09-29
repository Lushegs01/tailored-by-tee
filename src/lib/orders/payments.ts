import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { scheduleOrderConfirmationEmail } from "@/lib/email/order-emails";
import { createPaymentReference, evaluatePayment, type PaystackTransaction } from "@/lib/payments/paystack-core";
import { initializeTransaction, isPaystackTestMode, verifyTransaction } from "@/lib/payments/paystack";

import { orderStatusPath } from "./access";
import { CheckoutError } from "./errors";
import {
  confirmationEmailDue,
  paymentInProgressMessage,
  paymentRetryDelay,
  settlementPath,
  type SettleOutcome,
} from "./settlement";

/*
 * Paying for an order.
 *
 * startPayment opens a Paystack checkout for an order that still holds its stock.
 * settlePayment decides what a payment means, from Paystack's own verification —
 * never from the browser, and never from a webhook body alone — and applies it
 * exactly once: a conditional claim on the payment row means callback, webhook
 * and retries can arrive in any order, any number of times.
 *
 * A hold guarantees stock; it is not a payment deadline. A payment that completes
 * after `reservedUntil` while the order is still PENDING (not yet swept) is accepted:
 * its pieces were still held for it, so no one else could have bought them. Only
 * once a hold has been released — its stock back on sale — does a late payment
 * have to find every piece still free, or be flagged for a refund.
 */

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

export interface PayableOrder {
  id: string;
  number: string;
}

/** Where Paystack sends the shopper back to (our verifier) and where "Cancel payment" goes (the order page). */
export function paymentLinks(origin: string, orderNumber: string, accessToken: string) {
  const orderPage = `${origin}${orderStatusPath(orderNumber, accessToken)}`;
  const callback = new URL("/api/payments/paystack/return", origin);
  callback.searchParams.set("order", orderNumber);
  callback.searchParams.set("key", accessToken);
  return { callbackUrl: callback.toString(), cancelUrl: orderPage };
}

/** Statuses of an order that has been paid for and is going ahead. */
const PAID_STATUSES: ReadonlySet<string> = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

/** Opens a Paystack checkout. Throws a CheckoutError with a shopper-facing message when it can't. */
export async function startPayment(order: PayableOrder, links: { callbackUrl: string; cancelUrl: string }): Promise<string> {
  const db = getDb();
  // An earlier attempt may already have gone through without our hearing (a late webhook, a
  // return that never arrived): settle those first, so a paid order is never offered a second checkout.
  const retryDelay = await settleEarlierAttempts(order.id);

  const current = await db.order.findUnique({
    where: { id: order.id },
    select: { number: true, email: true, total: true, status: true, reservedUntil: true },
  });

  if (current && PAID_STATUSES.has(current.status)) {
    throw new CheckoutError("already_paid", "This order has already been paid. Refresh the page to see it confirmed.");
  }
  if (retryDelay > 0) {
    // Also when the hold has just ended: that payment may yet complete, and its page will say so.
    throw new CheckoutError("payment_in_progress", paymentInProgressMessage(retryDelay));
  }
  if (!current || current.status !== "PENDING" || !current.reservedUntil || current.reservedUntil <= new Date()) {
    throw new CheckoutError("unavailable", "This order can no longer be paid — its hold on the pieces has ended.");
  }

  const reference = createPaymentReference(current.number);
  await db.payment.create({
    data: {
      orderId: order.id,
      reference,
      amount: current.total,
      currency: "NGN",
      status: "PENDING",
      isTest: isPaystackTestMode(),
    },
  });

  try {
    const transaction = await initializeTransaction({
      email: current.email,
      amount: current.total,
      reference,
      callbackUrl: links.callbackUrl,
      cancelUrl: links.cancelUrl,
      metadata: { orderNumber: current.number },
    });
    await db.payment.update({ where: { reference }, data: { accessCode: transaction.accessCode } });
    return transaction.authorizationUrl;
  } catch (error) {
    console.error(`[payments] could not start ${reference}`, error instanceof Error ? error.message : error);
    await db.payment
      .update({ where: { reference }, data: { status: "FAILED", gatewayResponse: "Could not start with Paystack" } })
      .catch(() => undefined);
    throw new CheckoutError(
      "unavailable",
      "We couldn’t open the payment page just now. Your pieces are still held — please try again.",
    );
  }
}

/** How far back a new checkout looks for earlier attempts on the same order (holds are far shorter). */
const EARLIER_ATTEMPTS_MS = 2 * 60 * 60_000;
/** At most this many earlier attempts are re-checked with Paystack before a new checkout (the newest). */
const EARLIER_ATTEMPTS_CHECKED = 5;
/**
 * How settlePayment's note starts on an attempt it rejected (money moved, but not
 * what was asked for). Such an attempt is FAILED for good: Paystack's answer for it
 * won't change, so it isn't asked again.
 */
const REJECTED_NOTE_PREFIX = "Rejected (";

/**
 * Re-checks, with Paystack, the order's recent payment attempts that are still
 * unsettled, before another checkout opens. One that has paid settles the order
 * (and the caller then finds it paid). Returns how long the new checkout must wait
 * for any Paystack says may still take the customer's money (see paymentRetryDelay),
 * since both could otherwise be charged — 0 if none. "Abandoned" and "failed"
 * attempts are asked again too: neither is final while the checkout is still open,
 * perhaps in another tab — a shopper can come back to it, or try another card after
 * a decline. Attempts whose checkout never opened (no access code) are left out: no
 * one could have paid them. So are ones settlePayment rejected, which are final — a
 * few of those (or of declines) must not push out an older abandoned attempt that
 * was paid since. The checks run side by side, so a slow Paystack delays the new
 * checkout by one request's timeout, not one per attempt; settling is safe to run
 * concurrently (see confirmPayment).
 */
async function settleEarlierAttempts(orderId: string): Promise<number> {
  const now = new Date();
  const attempts = await getDb().payment.findMany({
    where: {
      orderId,
      status: { in: ["PENDING", "ABANDONED", "FAILED"] },
      accessCode: { not: null },
      createdAt: { gt: new Date(now.getTime() - EARLIER_ATTEMPTS_MS) },
      // Not rejected. A missing note is spelled out, since in SQL NOT (NULL LIKE …) matches nothing.
      OR: [{ gatewayResponse: null }, { NOT: { gatewayResponse: { startsWith: REJECTED_NOTE_PREFIX } } }],
    },
    orderBy: { createdAt: "desc" },
    take: EARLIER_ATTEMPTS_CHECKED,
    select: { reference: true, createdAt: true },
  });

  const delays = await Promise.all(
    attempts.map(async (attempt) => {
      let outcome: SettleOutcome;
      try {
        outcome = await settlePayment(attempt.reference);
      } catch (error) {
        // Paystack couldn't be asked, which decides nothing, so paying isn't blocked. A second
        // successful payment would still be recognised when it settles, and flagged for a refund.
        console.error(`[payments] could not re-check ${attempt.reference}`, error instanceof Error ? error.message : error);
        return 0;
      }
      return paymentRetryDelay(outcome, attempt.createdAt, now);
    }),
  );
  return Math.max(0, ...delays);
}

export type { SettleOutcome } from "./settlement";

/** Asks Paystack what happened to a payment and applies it to the order. Safe to call repeatedly. */
export async function settlePayment(reference: string): Promise<SettleOutcome> {
  const db = getDb();
  const payment = await db.payment.findUnique({
    where: { reference },
    select: { id: true, orderId: true, amount: true, currency: true, status: true, gatewayResponse: true },
  });
  if (!payment) return "unknown_reference";
  if (payment.status === "SUCCESS") {
    // Settled before. If its confirmation email never went out, this is another chance (see settlement.ts).
    scheduleOrderConfirmationEmail(payment.orderId);
    return "already_paid";
  }

  const transaction = await verifyTransaction(reference);
  const outcome = evaluatePayment({ reference, amount: payment.amount, currency: payment.currency }, transaction);
  const gateway = {
    channel: transaction.channel ?? null,
    gatewayResponse: transaction.gateway_response ?? null,
    providerTransactionId: String(transaction.id),
    isTest: transaction.domain === "test",
    verifiedAt: new Date(),
  };

  switch (outcome) {
    case "pending":
    case "awaiting_customer":
      return outcome;
    case "failed":
    case "abandoned":
      // Not final: the shopper may still complete this checkout, which a later verification will see.
      await db.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: outcome === "failed" ? "FAILED" : "ABANDONED", ...gateway },
      });
      return outcome;
    case "confirmed": {
      const settled = await confirmPayment(payment.id, payment.orderId, reference, transaction, gateway);
      // Paid, by this call or one just before it: confirm by email after the response, unless that
      // has already gone. Never throws.
      if (confirmationEmailDue(settled)) scheduleOrderConfirmationEmail(payment.orderId);
      return settled;
    }
    default: {
      // Money may have moved, but not what we asked for: never confirm; record it for a person to resolve.
      const note = `${REJECTED_NOTE_PREFIX}${outcome}): Paystack reported ${transaction.status}, ${transaction.amount} ${transaction.currency}; expected ${payment.amount} ${payment.currency}.`;
      // Already recorded, word for word (a failed attempt is re-checked before each new checkout).
      if (payment.status === "FAILED" && payment.gatewayResponse === note) return "rejected";
      console.error(`[payments] ${reference} ${note}`);
      await db.$transaction([
        db.payment.updateMany({
          where: { id: payment.id, status: { not: "SUCCESS" } },
          data: { status: "FAILED", ...gateway, gatewayResponse: note },
        }),
        db.orderEvent.create({ data: { orderId: payment.orderId, type: "payment_rejected", note } }),
      ]);
      return "rejected";
    }
  }
}

type Gateway = {
  channel: string | null;
  gatewayResponse: string | null;
  providerTransactionId: string;
  isTest: boolean;
  verifiedAt: Date;
};

/** Held stock becomes sold stock: both counters drop together, so availability doesn't change. */
async function sellHeldStock(tx: Prisma.TransactionClient, variantId: string, quantity: number): Promise<boolean> {
  const affected = await tx.$executeRaw`
    UPDATE "Inventory"
    SET "onHand" = "onHand" - ${quantity}, "reserved" = "reserved" - ${quantity}, "updatedAt" = NOW()
    WHERE "variantId" = ${variantId} AND "reserved" >= ${quantity} AND "onHand" >= ${quantity}`;
  return affected === 1;
}

/** For a payment that arrived after its hold lapsed: sell from free stock, only if that much is free. */
async function sellFreeStock(tx: Prisma.TransactionClient, variantId: string, quantity: number): Promise<boolean> {
  const affected = await tx.$executeRaw`
    UPDATE "Inventory"
    SET "onHand" = "onHand" - ${quantity}, "updatedAt" = NOW()
    WHERE "variantId" = ${variantId} AND "onHand" - "reserved" >= ${quantity}`;
  return affected === 1;
}

async function restoreStock(tx: Prisma.TransactionClient, variantId: string, quantity: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Inventory" SET "onHand" = "onHand" + ${quantity}, "updatedAt" = NOW() WHERE "variantId" = ${variantId}`;
}

async function confirmPayment(
  paymentId: string,
  orderId: string,
  reference: string,
  transaction: PaystackTransaction,
  gateway: Gateway,
): Promise<SettleOutcome> {
  const paidAt = transaction.paid_at ? new Date(transaction.paid_at) : new Date();
  const how = [gateway.channel, gateway.isTest ? "Paystack test mode" : null].filter(Boolean).join(", ");

  return getDb().$transaction(async (tx) => {
    // The claim: whichever of callback, webhook or retry gets here first does the work; the rest stop.
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: { not: "SUCCESS" } },
      data: { status: "SUCCESS", paidAt, ...gateway },
    });
    if (claimed.count === 0) return "already_paid";

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, reservedUntil: true, items: { select: { variantId: true, quantity: true } } },
    });
    const lines = order.items.flatMap((item) => (item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : []));

    let path = settlementPath(order.status);

    if (path === "promote") {
      const promoted = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING" },
        data: { status: "PAID", paymentStatus: "SUCCESS", paidAt, reservedUntil: null },
      });
      if (promoted.count === 1) {
        for (const line of lines) {
          if (!(await sellHeldStock(tx, line.variantId, line.quantity))) {
            // The hold should always cover the line; if it somehow doesn't, sell from free stock and say so.
            const covered = await sellFreeStock(tx, line.variantId, line.quantity);
            console.error(`[payments] ${reference}: hold missing for ${line.variantId} (${covered ? "sold from free stock" : "stock short"})`);
          }
        }
        await tx.inventoryAdjustment.createMany({
          data: lines.map((line) => ({
            variantId: line.variantId,
            onHandDelta: -line.quantity,
            reservedDelta: -line.quantity,
            reason: "ORDER_FULFILLED" as const,
            orderId,
            note: `Sold on payment ${reference}`,
          })),
        });
        // Past the deadline but not yet swept: the pieces were still held for this order (see header).
        const late = order.reservedUntil !== null && paidAt > order.reservedUntil;
        await tx.orderEvent.create({
          data: {
            orderId,
            type: "payment_confirmed",
            fromStatus: "PENDING",
            toStatus: "PAID",
            note: [
              `Paid via Paystack${how ? ` (${how})` : ""}; ${reference}.`,
              late ? "Completed after the hold deadline; the pieces were still held for this order." : null,
            ]
              .filter(Boolean)
              .join(" "),
          },
        });
        return "paid";
      }

      // A sweep released the order between our read and this claim: the update waited for
      // the sweep's lock, then matched nothing. Re-read, so the payment takes the
      // after-release path below instead of being mistaken for a duplicate.
      const reread = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      path = settlementPath(reread.status);
      if (path === "promote") {
        // Can't happen (the update would have matched it). Roll back rather than guess: the
        // payment stays unclaimed, and the next verification settles it.
        throw new Error(`Order ${orderId} is still pending after a failed promote (${reference})`);
      }
    }

    if (path === "after_release") {
      // Paid after the hold lapsed. Keep the sale only if every piece is still free; otherwise undo and refund.
      const sold: typeof lines = [];
      for (const line of lines) {
        if (await sellFreeStock(tx, line.variantId, line.quantity)) sold.push(line);
        else break;
      }

      if (sold.length < lines.length) {
        for (const line of sold) await restoreStock(tx, line.variantId, line.quantity);
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "SUCCESS" } });
        await tx.orderEvent.create({
          data: { orderId, type: "payment_needs_refund", note: `Paid after the hold lapsed, but pieces had sold. Refund required: ${reference}.` },
        });
        console.error(`[payments] ${reference}: paid after release and out of stock — refund required`);
        return "needs_refund";
      }

      // Conditional, like the promote: of two late payments for this order racing (another tab,
      // another attempt), the second waits for the first's lock, then matches nothing — so the
      // pieces are never sold twice, and it is refunded as a duplicate below.
      const reclaimed = await tx.order.updateMany({
        where: { id: orderId, status: "CANCELLED" },
        data: { status: "PAID", paymentStatus: "SUCCESS", paidAt, cancelledAt: null },
      });
      if (reclaimed.count === 1) {
        await tx.inventoryAdjustment.createMany({
          data: lines.map((line) => ({
            variantId: line.variantId,
            onHandDelta: -line.quantity,
            reason: "ORDER_FULFILLED" as const,
            orderId,
            note: `Sold on late payment ${reference}`,
          })),
        });
        await tx.orderEvent.create({
          data: { orderId, type: "payment_confirmed_after_release", fromStatus: "CANCELLED", toStatus: "PAID", note: `Paid after the hold lapsed; pieces were still available. ${reference}.` },
        });
        return "paid_after_release";
      }

      // Another payment took the order first: put back what this one sold, and re-read it.
      for (const line of lines) await restoreStock(tx, line.variantId, line.quantity);
      const reread = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      if (settlementPath(reread.status) !== "duplicate") {
        // Can't happen (the update would have matched a released order, and one never returns to
        // pending). Roll back rather than guess: the payment stays unclaimed for the next verification.
        throw new Error(`Order ${orderId} is ${reread.status} after a failed late claim (${reference})`);
      }
    }

    // Already paid by another payment (two tabs, two attempts): this one must be refunded.
    await tx.orderEvent.create({
      data: { orderId, type: "duplicate_payment", note: `A second successful payment arrived (${reference}). Refund required.` },
    });
    console.error(`[payments] ${reference}: duplicate payment — refund required`);
    return "needs_refund";
  }, TRANSACTION);
}
