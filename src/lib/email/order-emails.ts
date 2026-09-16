import "server-only";

import { after } from "next/server";

import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import type { Prisma } from "@/generated/prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";

import {
  renderOrderConfirmationEmail,
  tidy,
  tidyOptional,
  type ConfirmationEmailOrder,
} from "./order-confirmation-template";
import { isEmailConfigured, sendEmail } from "./send";

/*
 * The order confirmation: sent when a payment settles an order as paid (see
 * settlePayment), and recorded on the order's timeline once it has gone. Until
 * it is recorded, any later settlement of the order (a webhook redelivery, the
 * shopper's return) and the reservation sweep try again; once recorded it is
 * never sent again. This module loads the order and sends; the words and markup
 * live in order-confirmation-template.ts, which is pure and tested.
 *
 * Names, addresses and notes are typed by customers and product copy by staff:
 * every value is tidied to a single line here, and escaped by the template.
 */

export {
  renderOrderConfirmationEmail,
  type ConfirmationEmailOrder,
  type RenderedEmail,
} from "./order-confirmation-template";

/* ── Loading and sending ── */

/** The timeline event that records a sent confirmation. */
const CONFIRMATION_EMAILED = "confirmation_emailed";

/**
 * Confirmations go out only this soon after payment: inside Resend's 24-hour
 * idempotency window, so a retry can never deliver a second copy — including for
 * orders confirmed before sends were recorded.
 */
const SEND_WITHIN_MS = 23 * 60 * 60_000;

const confirmationSelect = {
  id: true,
  number: true,
  email: true,
  customerName: true,
  status: true,
  paymentStatus: true,
  paidAt: true,
  subtotal: true,
  discountTotal: true,
  shippingTotal: true,
  total: true,
  couponCode: true,
  deliveryMethod: true,
  deliveryZone: true,
  deliveryEstimate: true,
  shipFullName: true,
  shipLine1: true,
  shipLine2: true,
  shipCity: true,
  shipState: true,
  shipPostalCode: true,
  deliveryNotes: true,
  items: {
    orderBy: { id: "asc" },
    select: { productName: true, colorName: true, sizeLabel: true, quantity: true, lineTotal: true },
  },
  // The latest successful payment: its mode decides the "test payment" line.
  payments: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 1, select: { isTest: true } },
  // Whether it has been sent already.
  events: { where: { type: CONFIRMATION_EMAILED }, take: 1, select: { id: true } },
} satisfies Prisma.OrderSelect;

type ConfirmationRow = Prisma.OrderGetPayload<{ select: typeof confirmationSelect }>;

/** Only orders that are paid and still going ahead get a confirmation. */
const CONFIRMED_STATUSES: readonly string[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

function toConfirmationOrder(row: ConfirmationRow, isTestPayment: boolean): ConfirmationEmailOrder {
  const zone = deliveryPolicy.zones.find((item) => item.id === row.deliveryZone);
  const pickup = row.deliveryMethod === "PICKUP";
  const stateName = findState(row.shipState)?.name ?? tidyOptional(row.shipState);

  return {
    number: tidy(row.number),
    email: tidy(row.email),
    customerName: tidy(row.customerName),
    items: row.items.map((item) => ({
      name: tidy(item.productName),
      colorName: tidy(item.colorName),
      sizeLabel: tidy(item.sizeLabel),
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    totals: {
      subtotal: row.subtotal,
      discountTotal: row.discountTotal,
      shippingTotal: row.shippingTotal,
      total: row.total,
    },
    couponCode: tidyOptional(row.couponCode),
    delivery: {
      method: pickup ? "pickup" : "delivery",
      label: pickup ? (deliveryPolicy.pickup?.name ?? "Collection") : (zone?.name ?? "Delivery"),
      estimate: tidyOptional(row.deliveryEstimate),
      addressLines: pickup
        ? [tidyOptional(deliveryPolicy.pickup?.address)].filter((line): line is string => Boolean(line))
        : [
            tidyOptional(row.shipFullName),
            tidyOptional(row.shipLine1),
            tidyOptional(row.shipLine2),
            [tidyOptional(row.shipCity), stateName].filter(Boolean).join(", ") || null,
            tidyOptional(row.shipPostalCode),
          ].filter((line): line is string => Boolean(line)),
      notes: tidyOptional(row.deliveryNotes),
    },
    isTestPayment,
  };
}

/**
 * Emails the customer their order confirmation, unless it has gone already. A
 * no-op without email or a database; skips orders that aren't paid. Resend drops
 * a repeat with the same idempotency key for 24 hours, so two sends racing each
 * other still deliver one email. Throws when sending fails — callers that
 * mustn't fail use scheduleOrderConfirmationEmail.
 */
export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  if (!isEmailConfigured() || !isDatabaseConfigured()) return;

  const db = getDb();
  const row = await db.order.findUnique({ where: { id: orderId }, select: confirmationSelect });
  if (!row) {
    console.warn(`[email] order ${orderId} not found; no confirmation sent`);
    return;
  }
  if (row.events.length > 0) return;
  if (row.paidAt && Date.now() - row.paidAt.getTime() > SEND_WITHIN_MS) return;

  const payment = row.payments[0];
  if (!payment || row.paymentStatus !== "SUCCESS" || !CONFIRMED_STATUSES.includes(row.status)) {
    console.warn(`[email] ${row.number} is not a paid, confirmed order; no confirmation sent`);
    return;
  }

  const email = renderOrderConfirmationEmail(toConfirmationOrder(row, payment.isTest));
  await sendEmail({
    to: row.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `order-confirmed-${row.id}`,
  });

  try {
    // Two sends can race (the webhook and the shopper's return): Resend delivers one email,
    // and looking again here keeps the timeline to one entry as well, bar a photo finish.
    const recorded = await db.orderEvent.findFirst({
      where: { orderId: row.id, type: CONFIRMATION_EMAILED },
      select: { id: true },
    });
    if (!recorded) {
      await db.orderEvent.create({
        data: { orderId: row.id, type: CONFIRMATION_EMAILED, note: "Order confirmation emailed." },
      });
    }
  } catch (error) {
    // Sent, just not recorded: a retry within 24 hours is dropped by Resend's idempotency key.
    console.error(`[email] ${row.number}: confirmation sent but not recorded`, error instanceof Error ? error.message : error);
  }
}

/**
 * Sends the confirmation after the current response, without delaying or ever
 * failing the caller: errors are logged, never thrown. Inside a request (route
 * handlers, server actions) it runs via after(); anywhere else it runs detached.
 */
export function scheduleOrderConfirmationEmail(orderId: string): void {
  const task = () =>
    sendOrderConfirmationEmail(orderId).catch((error: unknown) => {
      console.error(`[email] order confirmation for ${orderId} failed`, error instanceof Error ? error.message : error);
    });

  try {
    after(task);
  } catch {
    // No request scope (a script, say): after() throws, so send it on its own.
    void task();
  }
}

/* ── Retrying ── */

const RETRY_INTERVAL_MS = 10 * 60_000;
/** Paid long enough ago that the first send has had its chance. */
const RETRY_AFTER_MS = 5 * 60_000;
const RETRY_BATCH = 5;

let lastRetryAt = 0;

/**
 * Sends confirmations whose first send failed (Resend down or slow, or the
 * server stopped before after() finished): paid orders from the last day with no
 * record of one. A few at a time, and at most every ten minutes per server
 * instance; the reservation sweep calls it after shopper activity. Never throws.
 */
export async function retryUnsentConfirmations(now = new Date()): Promise<void> {
  if (!isEmailConfigured() || !isDatabaseConfigured() || now.getTime() - lastRetryAt < RETRY_INTERVAL_MS) return;
  lastRetryAt = now.getTime();

  try {
    const orders = await getDb().order.findMany({
      where: {
        status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] },
        // Placed within the window too, so the (status, createdAt) index narrows the search.
        createdAt: { gte: new Date(now.getTime() - SEND_WITHIN_MS - 60 * 60_000) },
        paymentStatus: "SUCCESS",
        paidAt: { gte: new Date(now.getTime() - SEND_WITHIN_MS), lte: new Date(now.getTime() - RETRY_AFTER_MS) },
        events: { none: { type: CONFIRMATION_EMAILED } },
      },
      orderBy: { paidAt: "asc" },
      take: RETRY_BATCH,
      select: { id: true, number: true },
    });

    for (const order of orders) {
      try {
        await sendOrderConfirmationEmail(order.id);
      } catch (error) {
        console.error(`[email] retrying the confirmation for ${order.number} failed`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error("[email] could not look for unsent confirmations", error instanceof Error ? error.message : error);
  }
}
