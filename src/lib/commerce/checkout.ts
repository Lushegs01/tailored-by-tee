import "server-only";

import { quoteCart } from "@/lib/catalog/repository";
import type { CartLineInput, CartQuote, Kobo } from "@/lib/catalog/types";

import { countCouponUses, findCouponRule } from "./coupons";
import { quoteDelivery, type DeliveryMethod, type DeliveryQuote } from "./delivery";
import { evaluateCoupon, normalizeCouponCode } from "./discounts";
import { computeTotals, type OrderTotals } from "./totals";

/*
 * The authoritative price of a checkout: the bag re-priced from the catalogue with
 * live stock, the discount code re-validated from its stored rules, and delivery
 * from the configured zones. The order is created from this — never from anything
 * the browser displayed.
 */

export interface CheckoutQuoteInput {
  lines: CartLineInput[];
  deliveryMethod: DeliveryMethod;
  stateCode: string | null;
  couponCode: string | null;
  /** Needed for per-customer coupon limits. */
  email: string | null;
}

export interface AppliedCoupon {
  couponId: string;
  code: string;
  discount: Kobo;
  description: string | null;
}

export interface CheckoutQuote {
  cart: CartQuote;
  delivery: DeliveryQuote | null;
  coupon: AppliedCoupon | null;
  couponError: string | null;
  totals: OrderTotals;
}

export async function quoteCheckout(input: CheckoutQuoteInput): Promise<CheckoutQuote> {
  const cart = await quoteCart(input.lines);

  let coupon: AppliedCoupon | null = null;
  let couponError: string | null = null;
  const code = input.couponCode ? normalizeCouponCode(input.couponCode) : "";

  if (code) {
    const rule = await findCouponRule(code);
    const customerUses =
      rule && rule.perCustomerLimit !== null && input.email ? await countCouponUses(rule.id, input.email) : 0;
    const result = evaluateCoupon(rule, code, {
      now: new Date(),
      lines: cart.lines.map((line) => ({
        productId: line.productId,
        categoryId: line.categoryId,
        lineTotal: line.lineTotal,
      })),
      customerUses,
    });
    if (result.ok) {
      coupon = { couponId: result.couponId, code: result.code, discount: result.discount, description: result.description };
    } else {
      couponError = result.message;
    }
  }

  const discount = coupon?.discount ?? 0;
  const delivery = quoteDelivery({
    method: input.deliveryMethod,
    stateCode: input.stateCode,
    subtotal: Math.max(0, cart.subtotal - discount),
  });
  const totals = computeTotals({ subtotal: cart.subtotal, discount, shipping: delivery?.fee ?? 0 });

  return { cart, delivery, coupon, couponError, totals };
}
