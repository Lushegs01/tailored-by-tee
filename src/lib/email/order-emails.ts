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
 * The order confirmation: sent once, when a payment first settles an order as
 * paid (see settlePayment). This module loads the order and sends; the words and
 * markup live in order-confirmation-template.ts, which is pure and tested.
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

const confirmationSelect = {
  id: true,
  number: true,
  email: true,
  customerName: true,
  status: true,
  paymentStatus: true,
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
 * Emails the customer their order confirmation. A no-op without email or a
 * database; skips orders that aren't paid. Resend drops a repeat with the same
 * idempotency key for 24 hours, so a retry never sends it twice. Throws when
 * sending fails — callers that mustn't fail use scheduleOrderConfirmationEmail.
 */
export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  if (!isEmailConfigured() || !isDatabaseConfigured()) return;

  const row = await getDb().order.findUnique({ where: { id: orderId }, select: confirmationSelect });
  if (!row) {
    console.warn(`[email] order ${orderId} not found; no confirmation sent`);
    return;
  }

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
