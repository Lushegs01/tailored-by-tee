import "server-only";

/*
 * Paying for an order from the account pages. Unlike the private order link, these
 * URLs carry no secret: the return handler and the order page both require the
 * signed-in customer who can see the order, so there is nothing to put in a link.
 */

/** The account page for one order. */
export function accountOrderPath(orderNumber: string): string {
  return `/account/orders/${encodeURIComponent(orderNumber)}`;
}

/** Where Paystack sends a signed-in customer back to (our verifier) and where "Cancel payment" goes. */
export function accountPaymentLinks(origin: string, orderNumber: string): { callbackUrl: string; cancelUrl: string } {
  const callback = new URL("/api/payments/paystack/return", origin);
  callback.searchParams.set("order", orderNumber);
  return { callbackUrl: callback.toString(), cancelUrl: `${origin}${accountOrderPath(orderNumber)}` };
}
