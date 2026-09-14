import type { Kobo } from "@/lib/catalog/types";

import { siteConfig } from "./site";

/*
 * Delivery and returns policy — one source for checkout, product pages and the
 * /shipping and /returns pages.
 *
 * ⚠ PLACEHOLDER TERMS. Every fee, time and rule below is illustrative until the
 * studio confirms its real policy. While `isPlaceholder` is true, the policy pages
 * say so on the page. Replace the values, then set `isPlaceholder: false`.
 */

export interface DeliveryZone {
  id: string;
  name: string;
  /** State codes this zone covers (see config/nigeria.ts); null = every state no other zone claims. */
  states: readonly string[] | null;
  /** Integer kobo. */
  fee: Kobo;
  /** Orders at or above this subtotal deliver free (kobo); null = never. */
  freeOver: Kobo | null;
  estimate: string;
}

export interface DeliveryPolicy {
  isPlaceholder: boolean;
  zones: DeliveryZone[];
  pickup: { enabled: boolean; name: string; estimate: string; address: string } | null;
  dispatch: string;
  notes: string[];
}

export interface ReturnsPolicy {
  isPlaceholder: boolean;
  windowDays: number;
  summary: string;
  eligible: string[];
  excluded: string[];
  condition: string;
  exchanges: string;
  refunds: string;
  shipping: string;
  howTo: string[];
}

export const deliveryPolicy = {
  isPlaceholder: true,
  zones: [
    {
      id: "lagos",
      name: "Lagos",
      states: ["LA"],
      fee: 3_500_00,
      freeOver: siteConfig.commerce.freeDeliveryThreshold,
      estimate: "1–2 working days",
    },
    {
      id: "south-west",
      name: "South West",
      states: ["OG", "OY", "OS", "ON", "EK"],
      fee: 5_500_00,
      freeOver: null,
      estimate: "2–4 working days",
    },
    {
      id: "nationwide",
      name: "Rest of Nigeria",
      states: null,
      fee: 7_500_00,
      freeOver: null,
      estimate: "3–6 working days",
    },
  ],
  pickup: {
    enabled: true,
    name: "Collect from the studio",
    estimate: "Usually ready within one working day",
    address: siteConfig.contact.address,
  },
  dispatch: "Orders placed before 12:00 WAT on a working day leave the studio the same day.",
  notes: [
    "Delivery times are counted in working days (Monday to Friday), excluding public holidays.",
    "You'll receive tracking details by email as soon as your order is dispatched.",
    "A signature may be required on delivery for orders above ₦250,000.",
  ],
} satisfies DeliveryPolicy;

export const returnsPolicy = {
  isPlaceholder: true,
  windowDays: 14,
  summary: "Changed your mind? Return unworn pieces within 14 days of delivery for an exchange or a refund.",
  eligible: [
    "Unworn, unwashed pieces with their original tags attached",
    "Full-price and sale pieces alike",
  ],
  excluded: [
    "Pieces that have been worn, washed or altered",
    "Made-to-measure and personalised orders",
    "Hats and belts, for hygiene reasons, unless faulty",
  ],
  condition:
    "Pieces must arrive back in the condition you received them, in their original packaging where possible. We inspect every return before a refund is issued.",
  exchanges:
    "We'll exchange for another size or colour of the same piece, subject to availability. If the new piece costs more, we'll ask you to pay the difference.",
  refunds:
    "Refunds are made to the original payment method through Paystack within 5–10 working days of the return being approved. Original delivery fees are not refunded unless the piece is faulty.",
  shipping:
    "You arrange and pay for return delivery, unless the piece is faulty or we sent the wrong item — then we collect it at our cost.",
  howTo: [
    "Email us with your order number and the pieces you'd like to return.",
    "We'll reply within one working day with the return address and a reference.",
    "Pack the pieces securely, include the reference, and send them back.",
  ],
} satisfies ReturnsPolicy;

/** The zone a state belongs to; states no zone names fall into the catch-all zone. */
export function findDeliveryZone(stateCode: string): DeliveryZone {
  const code = stateCode.toUpperCase();
  const zones: DeliveryZone[] = deliveryPolicy.zones;
  return (
    zones.find((zone) => zone.states?.includes(code)) ??
    zones.find((zone) => zone.states === null) ??
    zones[zones.length - 1]
  );
}
