import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { scheduleOrderConfirmationEmail } from "@/lib/email/order-emails";
import { createPaymentReference, evaluatePayment, type PaystackTransaction } from "@/lib/payments/paystack-core";
import { initializeTransaction, isPaystackTestMode, verifyTransaction } from "@/lib/payments/paystack";

import { orderStatusPath } from "./access";
import { CheckoutError } from "./errors";

/*
 * Paying for an order.
 *
 * startPayment opens a Paystack checkout for an order that still holds its stock.
 * settlePayment decides what a payment means, from Paystack's own verification —
 * never from the browser, and never from a webhook body alone — and applies it
 * exactly once: a conditional claim on the payment row means callback, webhook
 * and retries can arrive in any order, any number of times.
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

/** Opens a Paystack checkout. Throws a CheckoutError with a shopper-facing message when it can't. */
export async function startPayment(order: PayableOrder, links: { callbackUrl: string; cancelUrl: string }): Promise<string> {
  const db = getDb();
  const current = await db.order.findUnique({
    where: { id: order.id },
    select: { number: true, email: true, total: true, status: true, reservedUntil: true },
  });

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

export type SettleOutcome =
  | "paid"
  | "paid_after_release"
  | "already_paid"
  | "needs_refund"
  | "rejected"
  | "failed"
  | "abandoned"
  | "pending"
  | "unknown_reference";

/** Asks Paystack what happened to a payment and applies it to the order. Safe to call repeatedly. */
export async function settlePayment(reference: string): Promise<SettleOutcome> {
  const db = getDb();
  const payment = await db.payment.findUnique({
    where: { reference },
    select: { id: true, orderId: true, amount: true, currency: true, status: true },
  });
  if (!payment) return "unknown_reference";
  if (payment.status === "SUCCESS") return "already_paid";

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
      return "pending";
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
      // This call won the claim and the order is now paid: confirm by email after the response. Never throws.
      if (settled === "paid" || settled === "paid_after_release") scheduleOrderConfirmationEmail(payment.orderId);
      return settled;
    }
    default: {
      // Money may have moved, but not what we asked for: never confirm; record it for a person to resolve.
      const note = `Rejected (${outcome}): Paystack reported ${transaction.status}, ${transaction.amount} ${transaction.currency}; expected ${payment.amount} ${payment.currency}.`;
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
      select: { status: true, items: { select: { variantId: true, quantity: true } } },
    });
    const lines = order.items.flatMap((item) => (item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : []));

    if (order.status === "PENDING") {
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
        await tx.orderEvent.create({
          data: { orderId, type: "payment_confirmed", fromStatus: "PENDING", toStatus: "PAID", note: `Paid via Paystack${how ? ` (${how})` : ""}; ${reference}.` },
        });
        return "paid";
      }
    }

    if (order.status === "CANCELLED") {
      // Paid after the hold lapsed. Keep the sale only if every piece is still free; otherwise undo and refund.
      const sold: typeof lines = [];
      for (const line of lines) {
        if (await sellFreeStock(tx, line.variantId, line.quantity)) sold.push(line);
        else break;
      }

      if (sold.length === lines.length) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "PAID", paymentStatus: "SUCCESS", paidAt, cancelledAt: null },
        });
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

      for (const line of sold) await restoreStock(tx, line.variantId, line.quantity);
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "SUCCESS" } });
      await tx.orderEvent.create({
        data: { orderId, type: "payment_needs_refund", note: `Paid after the hold lapsed, but pieces had sold. Refund required: ${reference}.` },
      });
      console.error(`[payments] ${reference}: paid after release and out of stock — refund required`);
      return "needs_refund";
    }

    // Already paid by another payment (two tabs, two attempts): this one must be refunded.
    await tx.orderEvent.create({
      data: { orderId, type: "duplicate_payment", note: `A second successful payment arrived (${reference}). Refund required.` },
    });
    console.error(`[payments] ${reference}: duplicate payment — refund required`);
    return "needs_refund";
  }, TRANSACTION);
}
