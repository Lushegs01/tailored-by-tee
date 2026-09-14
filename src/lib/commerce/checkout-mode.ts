import "server-only";

import { getCatalogSource } from "@/lib/catalog/sources";

/**
 * Whether checkout can take orders here.
 *
 * - "orders-only": orders are created and stock is held, but payment isn't
 *   connected yet — development only, clearly labelled as a test on every screen.
 * - "unavailable": no database, or production without payments. Nothing can be
 *   ordered, and the page says so instead of pretending.
 *
 * The payments phase adds "live" (Paystack configured).
 */
export type CheckoutMode = "orders-only" | "unavailable";

export function getCheckoutMode(): CheckoutMode {
  if (getCatalogSource() !== "database") return "unavailable";
  return process.env.NODE_ENV === "production" ? "unavailable" : "orders-only";
}
