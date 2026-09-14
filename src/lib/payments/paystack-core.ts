import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { Kobo } from "@/lib/catalog/types";

/*
 * The Paystack rules that decide money, kept pure so each is covered by tests:
 * webhook signatures, what a verified transaction means for an order, and the
 * identifiers we hand to Paystack. The HTTP client lives in ./paystack.ts.
 */

/**
 * Paystack signs each webhook with an HMAC-SHA512 of the raw body, keyed with the
 * secret key, sent in `x-paystack-signature`. Compared in constant time.
 */
export function verifyPaystackSignature(rawBody: string, signature: string | null | undefined, secretKey: string): boolean {
  if (!signature || !secretKey) return false;
  const received = signature.trim().toLowerCase();
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
  if (received.length !== expected.length || !/^[0-9a-f]+$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

/** The fields of Transaction Verify that we rely on (Paystack sends many more). */
export const paystackTransactionSchema = z.object({
  id: z.number(),
  domain: z.string(),
  status: z.string(),
  reference: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  channel: z.string().nullish(),
  gateway_response: z.string().nullish(),
  paid_at: z.string().nullish(),
});

export type PaystackTransaction = z.infer<typeof paystackTransactionSchema>;

export type PaymentOutcome =
  | "confirmed"
  | "amount_mismatch"
  | "currency_mismatch"
  | "reference_mismatch"
  | "failed"
  | "abandoned"
  | "pending";

/**
 * What a verified transaction means. Only an exact match — our reference, NGN,
 * and precisely the amount we asked for — confirms a payment. "abandoned" is not
 * final: Paystack reports it until the shopper completes payment, which can still happen.
 */
export function evaluatePayment(
  expected: { reference: string; amount: Kobo; currency: string },
  transaction: PaystackTransaction,
): PaymentOutcome {
  if (transaction.reference !== expected.reference) return "reference_mismatch";
  if (transaction.status === "success") {
    if (transaction.currency !== expected.currency) return "currency_mismatch";
    if (transaction.amount !== expected.amount) return "amount_mismatch";
    return "confirmed";
  }
  if (transaction.status === "failed" || transaction.status === "reversed") return "failed";
  if (transaction.status === "abandoned") return "abandoned";
  return "pending";
}

/** A fresh reference per payment attempt (Paystack rejects a reused one): "TBT-ORD-2026-000004-9f2c71ab". */
export function createPaymentReference(orderNumber: string): string {
  return `TBT-${orderNumber}-${randomBytes(4).toString("hex")}`;
}

/** One key per Paystack event and transaction, so a redelivered webhook is recognised. */
export function webhookEventKey(event: string, data: { id?: number | string | null; reference?: string | null }): string {
  return `paystack:${event}:${data.id ?? data.reference ?? "unknown"}`;
}

/** Paystack's hosted checkout is the only place a shopper is ever redirected to pay. */
export function isPaystackCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "paystack.com" || url.hostname.endsWith(".paystack.com"));
  } catch {
    return false;
  }
}
