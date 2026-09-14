/**
 * Failures a shopper can act on. Their messages are written for the checkout
 * page and returned as-is; anything else is logged and replaced by a generic line.
 */
export type CheckoutErrorCode =
  | "empty_bag"
  | "bag_changed"
  | "stock_conflict"
  | "coupon_invalid"
  | "delivery_unavailable"
  | "unavailable";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;

  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}
