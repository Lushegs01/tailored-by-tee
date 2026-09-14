import type { Kobo } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format";

/*
 * Discount codes. Every rule is decided here, on the server, from the coupon's
 * stored record and the server-priced bag — never from anything the browser
 * says a code is worth. Pure, so each rule is covered by tests.
 */

export interface CouponRule {
  id: string;
  code: string;
  description: string | null;
  type: "percentage" | "fixed";
  /** Whole percent (1–100) for percentage; kobo for fixed. */
  value: number;
  minSubtotal: Kobo | null;
  maxDiscount: Kobo | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  /** Restrictions; both empty = the whole bag qualifies. */
  categoryIds: string[];
  productIds: string[];
}

export interface DiscountLine {
  productId: string;
  categoryId: string;
  lineTotal: Kobo;
}

export interface CouponContext {
  now: Date;
  lines: DiscountLine[];
  /** Orders this customer (by email) has already placed with the code. */
  customerUses: number;
}

export type CouponRejection =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted"
  | "customer_limit"
  | "min_subtotal"
  | "not_applicable";

export type CouponResult =
  | { ok: true; couponId: string; code: string; discount: Kobo; description: string | null }
  | { ok: false; code: string; reason: CouponRejection; message: string };

/** Codes are matched without case or spaces: " welcome 10 " → "WELCOME10". */
export function normalizeCouponCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

const reject = (code: string, reason: CouponRejection, message: string): CouponResult => ({
  ok: false,
  code,
  reason,
  message,
});

/** Whole naira, rounded down: prices never show kobo, so neither do discounts. */
const toWholeNaira = (amount: Kobo) => Math.floor(amount / 100) * 100;

export function evaluateCoupon(rule: CouponRule | null, code: string, context: CouponContext): CouponResult {
  // Unknown and switched-off codes read the same, so the check can't be used to discover codes.
  if (!rule || !rule.isActive) return reject(code, rule ? "inactive" : "not_found", "That code isn’t valid.");
  if (rule.startsAt && context.now < rule.startsAt) return reject(code, "not_started", "That code isn’t active yet.");
  if (rule.endsAt && context.now >= rule.endsAt) return reject(code, "expired", "That code has expired.");
  if (rule.usageLimit !== null && rule.usageCount >= rule.usageLimit) {
    return reject(code, "exhausted", "That code is no longer available.");
  }
  if (rule.perCustomerLimit !== null && context.customerUses >= rule.perCustomerLimit) {
    return reject(code, "customer_limit", "You’ve already used that code.");
  }

  const subtotal = context.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (rule.minSubtotal !== null && subtotal < rule.minSubtotal) {
    return reject(code, "min_subtotal", `Spend ${formatPrice(rule.minSubtotal)} or more to use this code.`);
  }

  const restricted = rule.categoryIds.length > 0 || rule.productIds.length > 0;
  const eligible = context.lines
    .filter(
      (line) => !restricted || rule.productIds.includes(line.productId) || rule.categoryIds.includes(line.categoryId),
    )
    .reduce((sum, line) => sum + line.lineTotal, 0);
  if (eligible <= 0) return reject(code, "not_applicable", "That code doesn’t apply to anything in your bag.");

  let discount = rule.type === "percentage" ? Math.floor((eligible * rule.value) / 100) : Math.min(rule.value, eligible);
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  discount = toWholeNaira(Math.max(0, Math.min(discount, eligible)));

  if (discount <= 0) return reject(code, "not_applicable", "That code doesn’t apply to anything in your bag.");
  return { ok: true, couponId: rule.id, code: rule.code, discount, description: rule.description };
}
