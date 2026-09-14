import "server-only";

import { getCatalogSource } from "@/lib/catalog/sources";
import { isPaystackConfigured, isPaystackTestMode } from "@/lib/payments/paystack";

/**
 * Whether checkout can take orders here.
 *
 * - "live": a database and Paystack — orders are paid on Paystack's checkout.
 *   With test keys this is Paystack's sandbox, and every screen says so.
 * - "orders-only": a database but no Paystack, development only — orders are
 *   placed as labelled test orders and nothing is charged.
 * - "unavailable": no database, or production without payments. Nothing can be
 *   ordered, and the page says so instead of pretending.
 */
export type CheckoutMode = "live" | "orders-only" | "unavailable";

export function getCheckoutMode(): CheckoutMode {
  if (getCatalogSource() !== "database") return "unavailable";
  if (isPaystackConfigured()) return "live";
  return process.env.NODE_ENV === "production" ? "unavailable" : "orders-only";
}

/** Payments go through Paystack's sandbox (test keys): shoppers must be told no real money moves. */
export function paymentsAreTest(): boolean {
  return isPaystackTestMode();
}
