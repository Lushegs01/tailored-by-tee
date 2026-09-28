import { siteConfig } from "@/config/site";

import { escapeHtml, renderEmail } from "./layout";
import { orderPageUrl, tidy, tidyOptional, type RenderedEmail } from "./order-confirmation-template";

/*
 * The emails that follow the confirmation: "on its way", "ready to collect",
 * "it's arrived", "thank you for collecting". One short message each — what has
 * happened, what to expect, and a link to the order in the customer's account.
 *
 * Pure — no database, no network, no "server-only" — so it can be tested under
 * plain Node. Loading and sending live in order-status-email.ts. Names,
 * addresses and tracking references are typed by people: every value is tidied to
 * a single line here and escaped before it reaches the HTML.
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

/**
 * Which message this is. A collection order never "ships" or is "delivered": it
 * becomes ready to collect, and then collected.
 */
export const ORDER_STATUS_EMAIL_KINDS = ["shipped", "ready_for_collection", "delivered", "collected"] as const;

export type OrderStatusEmailKind = (typeof ORDER_STATUS_EMAIL_KINDS)[number];

export interface StatusEmailItem {
  name: string;
  colorName: string;
  sizeLabel: string;
  quantity: number;
}

/** A plain snapshot of the order, every string already tidied by the caller. */
export interface StatusEmailOrder {
  kind: OrderStatusEmailKind;
  number: string;
  customerName: string;
  items: StatusEmailItem[];
  /** "Lagos", "Collect from the studio" — the zone or pickup name at the time of the order. */
  deliveryLabel: string;
  /** The promised window, e.g. "1–2 working days". */
  deliveryEstimate: string | null;
  /** Where it's going, or where to collect it from. */
  addressLines: string[];
  carrier: string | null;
  trackingNumber: string | null;
}

interface Words {
  subject: string;
  heading: string;
  preheader: string;
  lead: string;
  followUp: string | null;
  detailsTitle: string;
}

/** Which order statuses send which email. Used by the sender and its idempotency key. */
export const STATUS_EMAIL_FOR: Record<"SHIPPED" | "DELIVERED", { delivery: OrderStatusEmailKind; pickup: OrderStatusEmailKind }> =
  {
    SHIPPED: { delivery: "shipped", pickup: "ready_for_collection" },
    DELIVERED: { delivery: "delivered", pickup: "collected" },
  };

/** The kind of email an order status calls for, given how the order is being fulfilled. */
export function statusEmailKind(
  status: "SHIPPED" | "DELIVERED",
  deliveryMethod: "DELIVERY" | "PICKUP",
): OrderStatusEmailKind {
  return deliveryMethod === "PICKUP" ? STATUS_EMAIL_FOR[status].pickup : STATUS_EMAIL_FOR[status].delivery;
}

function wordsFor(order: StatusEmailOrder): Words {
  const firstName = order.customerName.split(" ")[0] ?? "";
  const brand = siteConfig.name;

  switch (order.kind) {
    case "shipped":
      return {
        subject: `Order ${order.number} is on its way — ${brand}`,
        heading: firstName ? `It’s on its way, ${firstName}.` : "It’s on its way.",
        preheader: `Order ${order.number} has left the studio.`,
        lead: `Your order ${order.number} has left the studio.`,
        followUp: order.deliveryEstimate
          ? `It should reach you in ${lowerFirst(order.deliveryEstimate)}.`
          : "We’ll let you know if anything changes.",
        detailsTitle: "Delivery",
      };

    case "ready_for_collection":
      return {
        subject: `Order ${order.number} is ready to collect — ${brand}`,
        heading: firstName ? `Ready when you are, ${firstName}.` : "Ready when you are.",
        preheader: `Order ${order.number} is ready to collect from the studio.`,
        lead: `Your order ${order.number} is packed and ready to collect from the studio.`,
        followUp: `We’re open ${siteConfig.contact.hours}. Bring your order number with you.`,
        detailsTitle: "Collection",
      };

    case "delivered":
      return {
        subject: `Order ${order.number} has arrived — ${brand}`,
        heading: firstName ? `It’s arrived, ${firstName}.` : "It’s arrived.",
        preheader: `Order ${order.number} has been delivered.`,
        lead: `Your order ${order.number} has been delivered.`,
        followUp: "We hope you love it. If anything isn’t right, just reply to this email.",
        detailsTitle: "Delivered to",
      };

    case "collected":
      return {
        subject: `Order ${order.number} — thank you — ${brand}`,
        heading: firstName ? `Thank you, ${firstName}.` : "Thank you.",
        preheader: `Order ${order.number} has been collected.`,
        lead: `Your order ${order.number} has been collected from the studio.`,
        followUp: "We hope you love it. If anything isn’t right, just reply to this email.",
        detailsTitle: "Collected from",
      };
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function itemDetail(item: StatusEmailItem): string {
  return `${item.colorName} · ${item.sizeLabel} · Qty ${item.quantity}`;
}

/** Subject, HTML and plain-text versions of an order update. Pure: no database, no network. */
export function renderOrderStatusEmail(order: StatusEmailOrder): RenderedEmail {
  const words = wordsFor(order);
  const url = orderPageUrl(order.number);
  const showTracking = order.kind === "shipped" && Boolean(order.trackingNumber ?? order.carrier);
  const help = `Questions about your order? Email ${siteConfig.contact.email} or call ${siteConfig.contact.phone}, quoting ${order.number}.`;

  const trackingRows: { label: string; value: string }[] = showTracking
    ? [
        ...(order.carrier ? [{ label: "Courier", value: order.carrier }] : []),
        ...(order.trackingNumber ? [{ label: "Tracking number", value: order.trackingNumber }] : []),
      ]
    : [];

  /* ── HTML ── */

  const itemRows = order.items
    .map(
      (item) =>
        `<tr><td style="${BODY};padding:12px 16px 12px 0;border-bottom:1px solid ${HAIRLINE};vertical-align:top">${escapeHtml(item.name)}<br><span style="${QUIET}">${escapeHtml(itemDetail(item))}</span></td></tr>`,
    )
    .join("");

  const trackingHtml =
    trackingRows.length > 0
      ? `<tr><td style="${LABEL};padding-top:32px;padding-bottom:10px;border-bottom:1px solid ${HAIRLINE}">Tracking</td></tr>
<tr><td style="padding-top:14px"><table ${TABLE}>${trackingRows
          .map(
            (row) =>
              `<tr><td style="${QUIET};padding-bottom:6px;width:45%">${escapeHtml(row.label)}</td><td style="${BODY};padding-bottom:6px;word-break:break-all">${escapeHtml(row.value)}</td></tr>`,
          )
          .join("")}</table></td></tr>
<tr><td style="${QUIET};padding-top:6px">Tracking can take a few hours to show any movement.</td></tr>`
      : "";

  const detailsHtml = [
    `<tr><td style="${LABEL};padding-top:32px;padding-bottom:10px;border-bottom:1px solid ${HAIRLINE}">${escapeHtml(words.detailsTitle)}</td></tr>`,
    `<tr><td style="${BODY};padding-top:14px"><strong style="font-weight:600">${escapeHtml(order.deliveryLabel)}</strong></td></tr>`,
    order.addressLines.length > 0
      ? `<tr><td style="${QUIET};padding-top:10px">${order.addressLines.map((line) => escapeHtml(line)).join("<br>")}</td></tr>`
      : "",
  ].join("");

  const itemsHtml =
    order.items.length > 0
      ? `<tr><td style="${LABEL};padding-top:32px;padding-bottom:10px;border-bottom:1px solid ${HAIRLINE}">Your pieces</td></tr>
<tr><td><table ${TABLE}>${itemRows}</table></td></tr>`
      : "";

  const contactEmail = escapeHtml(siteConfig.contact.email);
  const bodyHtml = `<table ${TABLE}>
<tr><td style="${BODY};font-size:15px;line-height:24px">${escapeHtml(words.lead)}${words.followUp ? ` ${escapeHtml(words.followUp)}` : ""}</td></tr>
${trackingHtml}
${detailsHtml}
${itemsHtml}
<tr><td style="${QUIET};padding-top:32px">Questions about your order? Email <a href="mailto:${contactEmail}" style="color:${INK}">${contactEmail}</a> or call ${escapeHtml(siteConfig.contact.phone)}, quoting ${escapeHtml(order.number)}.</td></tr>
</table>`;

  const html = renderEmail({
    preheader: words.preheader,
    heading: words.heading,
    bodyHtml,
    cta: { label: "View your order", url },
  });

  /* ── Plain text ── */

  const text = [
    words.heading,
    "",
    [words.lead, words.followUp].filter(Boolean).join(" "),
    ...(trackingRows.length > 0
      ? ["", "TRACKING", "", ...trackingRows.map((row) => `${row.label}: ${row.value}`)]
      : []),
    "",
    words.detailsTitle.toUpperCase(),
    "",
    order.deliveryLabel,
    ...order.addressLines,
    ...(order.items.length > 0
      ? ["", "YOUR PIECES", "", ...order.items.map((item) => `${item.name} — ${itemDetail(item)}`)]
      : []),
    "",
    `View your order: ${url}`,
    "",
    help,
    "",
    `${siteConfig.name} · ${siteConfig.location}`,
  ].join("\n");

  return { subject: words.subject, html, text };
}

export { tidy, tidyOptional };
