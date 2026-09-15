import "server-only";

import { after } from "next/server";

import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import { siteConfig } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import type { Kobo } from "@/lib/catalog/types";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { formatPrice, pluralize } from "@/lib/format";

import { escapeHtml, renderEmail } from "./layout";
import { isEmailConfigured, sendEmail } from "./send";

/*
 * The order confirmation: sent once, when a payment first settles an order as
 * paid (see settlePayment). What was bought, what it cost, where it's going, and
 * a link to the order in the customer's account.
 *
 * Names, addresses and notes are typed by customers and product copy by staff:
 * every value is tidied to a single line and escaped before it reaches the HTML.
 */

// The frame's palette (layout.ts), repeated because table cells need inline styles.
const INK = "#161513";
const STONE = "#6a665f";
const HAIRLINE = "#d9d3c7";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const LABEL = `font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${STONE}`;
const BODY = `font-family:${SANS};font-size:14px;line-height:20px;color:${INK}`;
const QUIET = `font-family:${SANS};font-size:13px;line-height:20px;color:${STONE}`;
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;

/** What the confirmation shows: a plain snapshot of the order, every string already tidied. */
export interface ConfirmationEmailOrder {
  number: string;
  email: string;
  customerName: string;
  items: { name: string; colorName: string; sizeLabel: string; quantity: number; lineTotal: Kobo }[];
  totals: { subtotal: Kobo; discountTotal: Kobo; shippingTotal: Kobo; total: Kobo };
  couponCode: string | null;
  delivery: {
    method: "delivery" | "pickup";
    label: string;
    estimate: string | null;
    addressLines: string[];
    notes: string | null;
  };
  /** The payment was made with Paystack test keys: no real money moved. */
  isTestPayment: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** One line of text: control and bidi-override characters go, whitespace runs become one space. */
function tidy(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) continue;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : char;
  }
  return out.replace(/\s+/g, " ").trim();
}

function tidyOptional(value: string | null | undefined): string | null {
  const tidied = value ? tidy(value) : "";
  return tidied || null;
}

function orderPageUrl(orderNumber: string): string {
  return `${siteConfig.url.replace(/\/+$/, "")}/account/orders/${encodeURIComponent(orderNumber)}`;
}

function itemDetail(item: ConfirmationEmailOrder["items"][number]): string {
  return `${item.colorName} · ${item.sizeLabel} · Qty ${item.quantity}`;
}

function totalRows(order: ConfirmationEmailOrder): { label: string; value: string; isTotal?: boolean }[] {
  const { totals } = order;
  return [
    { label: "Subtotal", value: formatPrice(totals.subtotal) },
    ...(totals.discountTotal > 0
      ? [{ label: order.couponCode ? `Discount (${order.couponCode})` : "Discount", value: `−${formatPrice(totals.discountTotal)}` }]
      : []),
    {
      label: order.delivery.method === "pickup" ? "Collection" : "Delivery",
      value: totals.shippingTotal === 0 ? "Free" : formatPrice(totals.shippingTotal),
    },
    { label: "Total", value: formatPrice(totals.total), isTotal: true },
  ];
}

/** Subject, HTML and plain-text versions of the confirmation. Pure: no database, no network. */
export function renderOrderConfirmationEmail(order: ConfirmationEmailOrder): RenderedEmail {
  const firstName = order.customerName.split(" ")[0] ?? "";
  const heading = firstName ? `Thank you, ${firstName}.` : "Thank you.";
  const pickup = order.delivery.method === "pickup";
  const nextStep = pickup
    ? "We’ll email you again when it’s ready to collect."
    : "We’ll email you again as soon as it leaves the studio.";
  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const url = orderPageUrl(order.number);
  const footnote = `You can see this order at any time by signing in with ${order.email}. No password needed — we’ll email you a one-time link.`;
  const help = `Questions about your order? Email ${siteConfig.contact.email} or call ${siteConfig.contact.phone}, quoting ${order.number}.`;
  const sectionTitle = pickup ? "Collection" : "Delivery";
  const totals = totalRows(order);

  const subject = `Order ${order.number} confirmed — ${siteConfig.name}`;
  const preheader = `Order ${order.number} is confirmed: ${pluralize(pieces, "piece")}, ${formatPrice(order.totals.total)}.`;

  /* ── HTML ── */

  const testBadge = order.isTestPayment
    ? `<tr><td style="padding-top:20px"><span style="display:inline-block;border:1px solid ${INK};padding:6px 10px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${INK}">Test payment — no money moved</span></td></tr>`
    : "";

  const itemRows = order.items
    .map(
      (item) =>
        `<tr><td style="${BODY};padding:14px 16px 14px 0;border-bottom:1px solid ${HAIRLINE};vertical-align:top">${escapeHtml(item.name)}<br><span style="${QUIET}">${escapeHtml(itemDetail(item))}</span></td><td align="right" style="${BODY};padding:14px 0;border-bottom:1px solid ${HAIRLINE};vertical-align:top;white-space:nowrap">${escapeHtml(formatPrice(item.lineTotal))}</td></tr>`,
    )
    .join("");

  const totalHtml = totals
    .map((row, index) => {
      const beforeTotal = totals[index + 1]?.isTotal ?? false;
      const padding = row.isTotal
        ? `padding-top:14px;border-top:1px solid ${HAIRLINE}`
        : `padding-top:${index === 0 ? 16 : 8}px${beforeTotal ? ";padding-bottom:14px" : ""}`;
      const style = row.isTotal ? `${BODY};font-size:15px;font-weight:600` : QUIET;
      const valueStyle = row.isTotal ? style : `${BODY}`;
      return `<tr><td style="${style};${padding}">${escapeHtml(row.label)}</td><td align="right" style="${valueStyle};${padding};white-space:nowrap">${escapeHtml(row.value)}</td></tr>`;
    })
    .join("");

  const { delivery } = order;
  const deliveryHtml = [
    `<tr><td style="${LABEL};padding-top:36px;padding-bottom:10px;border-bottom:1px solid ${HAIRLINE}">${escapeHtml(sectionTitle)}</td></tr>`,
    `<tr><td style="${BODY};padding-top:14px"><strong style="font-weight:600">${escapeHtml(delivery.label)}</strong>${delivery.estimate ? `<br><span style="${QUIET}">${escapeHtml(delivery.estimate)}</span>` : ""}</td></tr>`,
    delivery.addressLines.length > 0
      ? `<tr><td style="${QUIET};padding-top:10px">${delivery.addressLines.map((line) => escapeHtml(line)).join("<br>")}</td></tr>`
      : "",
    delivery.notes ? `<tr><td style="${QUIET};padding-top:10px">Note: ${escapeHtml(delivery.notes)}</td></tr>` : "",
  ].join("");

  const contactEmail = escapeHtml(siteConfig.contact.email);
  const bodyHtml = `<table ${TABLE}>
<tr><td style="${BODY};font-size:15px;line-height:24px">Your order <strong style="font-weight:600">${escapeHtml(order.number)}</strong> is confirmed. ${escapeHtml(nextStep)}</td></tr>
${testBadge}
<tr><td style="${LABEL};padding-top:32px;padding-bottom:10px;border-bottom:1px solid ${HAIRLINE}">Your pieces</td></tr>
<tr><td><table ${TABLE}>${itemRows}${totalHtml}</table></td></tr>
${deliveryHtml}
<tr><td style="${QUIET};padding-top:32px">Questions about your order? Email <a href="mailto:${contactEmail}" style="color:${INK}">${contactEmail}</a> or call ${escapeHtml(siteConfig.contact.phone)}, quoting ${escapeHtml(order.number)}.</td></tr>
</table>`;

  const html = renderEmail({
    preheader,
    heading,
    bodyHtml,
    cta: { label: "View your order", url },
    footnote,
  });

  /* ── Plain text ── */

  const text = [
    heading,
    "",
    `Your order ${order.number} is confirmed. ${nextStep}`,
    ...(order.isTestPayment ? ["", "Test payment — no money moved."] : []),
    "",
    "YOUR PIECES",
    "",
    ...order.items.flatMap((item) => [`${item.name} — ${formatPrice(item.lineTotal)}`, itemDetail(item), ""]),
    ...totals.map((row) => `${row.label}: ${row.value}`),
    "",
    sectionTitle.toUpperCase(),
    "",
    delivery.estimate ? `${delivery.label} (${delivery.estimate})` : delivery.label,
    ...delivery.addressLines,
    ...(delivery.notes ? [`Note: ${delivery.notes}`] : []),
    "",
    `View your order: ${url}`,
    footnote,
    "",
    help,
    "",
    `${siteConfig.name} · ${siteConfig.location}`,
  ].join("\n");

  return { subject, html, text };
}

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
