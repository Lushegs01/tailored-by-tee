import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import type { DeliveryMethod } from "@/generated/prisma/enums";
import { ORDERS_PATH } from "@/lib/admin/order-transitions";
import { formatNigerianPhone, normalizeNigerianPhone } from "@/lib/commerce/phone";

/*
 * Wording and small conversions shared by the orders pages. Pure, so both the
 * server pages and the dialogs in the browser read the same words.
 */

export const ORDERS_LIST_PATH = ORDERS_PATH;

/** The zone's name as the customer saw it at checkout; the stored value is its id. */
export function deliveryZoneName(zoneId: string | null): string | null {
  if (!zoneId) return null;
  return deliveryPolicy.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId;
}

/** "Delivery — Lagos" / "Collect from the studio". */
export function deliveryLabel(method: DeliveryMethod, zoneId: string | null): string {
  if (method === "PICKUP") return deliveryPolicy.pickup?.name ?? "Collect from the studio";
  const zone = deliveryZoneName(zoneId);
  return zone ? `Delivery — ${zone}` : "Delivery";
}

export interface AddressParts {
  fullName: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

/** The delivery address as lines, with the state spelled out; the studio's address for a collection. */
export function addressLines(method: DeliveryMethod, address: AddressParts): string[] {
  if (method === "PICKUP") {
    const studio = deliveryPolicy.pickup?.address;
    return studio ? [studio] : [];
  }
  const stateName = findState(address.state)?.name ?? address.state;
  return [
    address.fullName,
    address.line1,
    address.line2,
    [address.city, stateName].filter(Boolean).join(", ") || null,
    address.postalCode,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

/**
 * "+234 803 123 4567" where the number is a Nigerian mobile, otherwise as stored.
 *
 * Checkout stores numbers in +234 form, but the number is normalised again here
 * rather than assumed: an order placed before that rule, or one whose number was
 * written by a script, still has to be readable — and dialable — by the owner. A
 * number that isn't a Nigerian mobile is shown exactly as it was given.
 */
export function phoneForDisplay(phone: string | null | undefined): string | null {
  const value = phone?.trim();
  if (!value) return null;
  return formatNigerianPhone(normalizeNigerianPhone(value) ?? value);
}

/** What a "tel:" link should carry: the dialable form, without the display spacing. */
export function phoneHref(phone: string | null | undefined): string | null {
  const value = phone?.trim();
  if (!value) return null;
  return `tel:${normalizeNigerianPhone(value) ?? value.replace(/[\s()-]/g, "")}`;
}

/** Who made a change, for the timeline and the refund list. */
export function actorName(actor: { name: string | null; email: string } | null | undefined): string {
  if (!actor) return "Outside the admin area";
  return actor.name?.trim() || actor.email;
}

/** The one line under the page title, explaining what the list holds. */
export const ORDERS_DESCRIPTION =
  "Every order placed through the shop, newest first. Test payments and demo orders are shown and labelled — use “Show” to hide them.";

export const NO_ORDERS_TITLE = "No orders yet";

export const NO_ORDERS_BODY =
  "Orders appear here the moment a customer reaches checkout, whether or not they pay. Nothing needs setting up first.";

export const NO_MATCHES_TITLE = "Nothing matches";

export const NO_MATCHES_BODY =
  "No orders match this search and these filters. Try another search, or clear the filters.";

/** What the owner is told when Paystack isn't configured, so the payment steps are missing. */
export const PAYSTACK_MISSING =
  "Paystack isn’t set up, so payments can’t be checked and refunds can’t be made. Your developer can add the keys — see Settings.";

/* ── One order ──────────────────────────────────────────────────────────── */

/** Paystack's channel names, in the owner's words. Anything new is shown as it comes. */
const CHANNELS: Record<string, string> = {
  card: "Card",
  bank: "Bank account",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
  qr: "QR code",
  mobile_money: "Mobile money",
  eft: "Bank transfer",
  apple_pay: "Apple Pay",
};

export function paymentChannelLabel(channel: string | null): string | null {
  if (!channel) return null;
  return CHANNELS[channel] ?? channel.replace(/[_-]+/g, " ");
}

/** "3 pieces across 2 lines", for the pieces heading. */
export function piecesSummary(lines: number, pieces: number): string {
  const piecesWord = `${pieces} ${pieces === 1 ? "piece" : "pieces"}`;
  if (lines === pieces) return piecesWord;
  return `${piecesWord} across ${lines} ${lines === 1 ? "line" : "lines"}`;
}

export const DEMO_ORDER_NOTE =
  "Demo content for evaluation, added by the sample-data script. It isn’t a real order, and the customer is never emailed about it.";

export const TEST_PAYMENT_NOTE =
  "Paid with Paystack’s test keys, so no real money moved. A refund here is a test refund.";

export const REFUND_DUE_NOTE =
  "This order is cancelled but the customer’s money is still with Paystack. Refund the payment below.";

export const NO_ACTIONS_NOTE =
  "There is nothing to do on this order at the moment.";

export const ITEMS_NOTE =
  "Exactly what the customer bought, at the prices they paid. These lines never change, even if a piece is later renamed or repriced.";

export const TIMELINE_NOTE =
  "Everything that has happened to this order, oldest first. “Outside the admin area” means the shop, Paystack or a scheduled job made the change.";

export const NOTE_HINT = "Only you and the other admins see notes. The customer is never shown them.";

export const PAYMENTS_NOTE =
  "Every attempt to pay, newest first. Only Paystack can mark a payment as successful — there is no way to do it here.";

export const REFUNDS_NOTE =
  "Money sent back through Paystack. Banks can take several working days to show it on the customer’s statement.";

export const TRACKING_NOTE =
  "Shown to the customer on their order page, and in the email sent when the order goes out.";
