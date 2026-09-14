import type { Kobo } from "@/lib/catalog/types";

/**
 * The money on an order, in integer kobo. The same identity the database
 * enforces with a CHECK constraint: total = subtotal − discount + shipping,
 * with the discount never larger than the subtotal.
 */
export interface OrderTotals {
  subtotal: Kobo;
  discountTotal: Kobo;
  shippingTotal: Kobo;
  total: Kobo;
}

const assertKobo = (label: string, value: number) => {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative whole number of kobo`);
};

export function computeTotals({ subtotal, discount, shipping }: { subtotal: Kobo; discount: Kobo; shipping: Kobo }): OrderTotals {
  assertKobo("subtotal", subtotal);
  assertKobo("discount", discount);
  assertKobo("shipping", shipping);

  const discountTotal = Math.min(discount, subtotal);
  return { subtotal, discountTotal, shippingTotal: shipping, total: subtotal - discountTotal + shipping };
}
