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
  | "unavailable"
  /** A new checkout was asked for, but an earlier payment has already paid for the order. */
  | "already_paid"
  /** A new checkout was asked for while Paystack is still confirming an earlier payment. */
  | "payment_in_progress";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;

  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}
