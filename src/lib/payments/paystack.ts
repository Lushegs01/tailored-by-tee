import "server-only";

import { z } from "zod";

import { isPaystackCheckoutUrl, paystackTransactionSchema, type PaystackTransaction } from "./paystack-core";

/*
 * Paystack's REST API, server-side only. The secret key never leaves the server;
 * responses are schema-checked before anything is done with them.
 */

const API_BASE = "https://api.paystack.co";
const TIMEOUT_MS = 15_000;

export class PaystackError extends Error {
  readonly code: string;
  readonly httpStatus: number | undefined;

  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "PaystackError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

/** True with test keys: payments go through Paystack's sandbox and no real money moves. */
export function isPaystackTestMode(): boolean {
  return process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") ?? false;
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("not_configured", "PAYSTACK_SECRET_KEY is not set.");
  return key;
}

async function request<T>(path: string, init: RequestInit, dataSchema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new PaystackError("network", `Paystack could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }

  const envelope = z
    .object({ status: z.boolean(), message: z.string().optional(), code: z.string().optional(), data: z.unknown() })
    .safeParse(await response.json().catch(() => null));
  if (!envelope.success) throw new PaystackError("bad_response", `Unexpected response from Paystack (${response.status}).`, response.status);

  const { status, message, code, data } = envelope.data;
  if (!response.ok || !status) {
    throw new PaystackError(code ?? "request_failed", message ?? `Paystack request failed (${response.status}).`, response.status);
  }

  const parsed = dataSchema.safeParse(data);
  if (!parsed.success) throw new PaystackError("bad_response", "Paystack returned data in an unexpected shape.", response.status);
  return parsed.data;
}

export interface InitializedTransaction {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/** Starts a payment on Paystack's hosted checkout. Amount is integer kobo, always NGN. */
export async function initializeTransaction(input: {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<InitializedTransaction> {
  const data = await request(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amount,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: { ...input.metadata, cancel_action: input.cancelUrl },
      }),
    },
    z.object({ authorization_url: z.string(), access_code: z.string(), reference: z.string() }),
  );

  if (!isPaystackCheckoutUrl(data.authorization_url) || data.reference !== input.reference) {
    throw new PaystackError("bad_response", "Paystack returned an unexpected checkout link.");
  }
  return { authorizationUrl: data.authorization_url, accessCode: data.access_code, reference: data.reference };
}

/** The authoritative state of a payment, asked of Paystack directly. */
export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" }, paystackTransactionSchema);
}
