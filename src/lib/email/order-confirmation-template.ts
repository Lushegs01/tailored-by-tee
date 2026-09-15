import { siteConfig } from "@/config/site";
import type { Kobo } from "@/lib/catalog/types";
import { formatPrice, pluralize } from "@/lib/format";

import { escapeHtml, renderEmail } from "./layout";

/*
 * The order confirmation's words and markup: what was bought, what it cost,
 * where it's going, and a link to the order in the customer's account.
 *
 * Pure — no database, no network, no "server-only" — so it can be tested under
 * plain Node. Loading and sending live in order-emails.ts.
 *
 * Names, addresses and notes are typed by customers and product copy by staff:
 * every value is tidied to a single line (tidy) before it gets here, and escaped
 * before it reaches the HTML.
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
export function tidy(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) continue;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : char;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** tidy() for optional values: empty after tidying reads as absent. */
export function tidyOptional(value: string | null | undefined): string | null {
  const tidied = value ? tidy(value) : "";
  return tidied || null;
}

/** The order's page in the customer's account (the same path as accountOrderPath). */
export function orderPageUrl(orderNumber: string): string {
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
