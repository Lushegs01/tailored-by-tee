import "server-only";

import { z } from "zod";

import { refundOutcome, type RefundOutcome } from "@/lib/admin/order-transitions";

/*
 * Paystack's refund API, server-side only — the one way money ever goes back to a
 * customer. Built exactly like ./paystack.ts (same base, same timeout, same
 * envelope handling, same PaystackError), kept separate so the checkout client
 * stays untouched.
 *
 *   POST /refund { transaction, amount? }  — ask for a refund
 *   GET  /refund/:id                        — what became of one
 *
 * Every response is schema-checked before anything is done with it, and the
 * secret key never leaves the server. Test keys work here as they do everywhere
 * else: the refund is a sandbox refund, and the payment it belongs to is already
 * flagged isTest, so the admin area labels it.
 */

const API_BASE = "https://api.paystack.co";
const TIMEOUT_MS = 20_000;

export class PaystackRefundError extends Error {
  readonly code: string;
  readonly httpStatus: number | undefined;
  /** True when asking again might work (a timeout, a 5xx); false for a refusal. */
  readonly retryable: boolean;

  constructor(code: string, message: string, httpStatus?: number, retryable = false) {
    super(message);
    this.name = "PaystackRefundError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackRefundError("not_configured", "PAYSTACK_SECRET_KEY is not set.");
  return key;
}

/** The fields of a Paystack refund we rely on (it sends many more). */
const refundDataSchema = z.object({
  id: z.union([z.number(), z.string()]),
  amount: z.number().int().nonnegative(),
  currency: z.string().nullish(),
  status: z.string(),
  domain: z.string().nullish(),
  expected_at: z.string().nullish(),
  transaction: z
    .union([
      z.number(),
      z.string(),
      z.object({ id: z.union([z.number(), z.string()]).nullish(), reference: z.string().nullish() }),
    ])
    .nullish(),
});

type RefundData = z.infer<typeof refundDataSchema>;

export interface PaystackRefund {
  /** Paystack's refund id, stored as Refund.providerReference. */
  id: string;
  /** Integer kobo Paystack says it is returning. */
  amount: number;
  currency: string | null;
  /** Paystack's own word, kept for the timeline. */
  status: string;
  /** What that word means for us. */
  outcome: RefundOutcome;
  /** Made against a test-mode transaction. */
  isTest: boolean;
  /** Paystack's estimate of when the customer sees the money, if it gave one. */
  expectedAt: string | null;
  /** The payment reference it belongs to, when Paystack echoes it. */
  transactionReference: string | null;
}

function toRefund(data: RefundData): PaystackRefund {
  const transaction = data.transaction;
  const reference =
    transaction && typeof transaction === "object" && typeof transaction.reference === "string"
      ? transaction.reference
      : null;

  return {
    id: String(data.id),
    amount: data.amount,
    currency: data.currency ?? null,
    status: data.status,
    outcome: refundOutcome(data.status),
    isTest: data.domain === "test",
    expectedAt: data.expected_at ?? null,
    transactionReference: reference,
  };
}

async function request(path: string, init: RequestInit): Promise<PaystackRefund> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // Nothing is known: the refund may or may not have been created. Retryable.
    throw new PaystackRefundError(
      "network",
      `Paystack could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      true,
    );
  }

  const envelope = z
    .object({ status: z.boolean(), message: z.string().optional(), code: z.string().optional(), data: z.unknown() })
    .safeParse(await response.json().catch(() => null));

  if (!envelope.success) {
    throw new PaystackRefundError(
      "bad_response",
      `Unexpected response from Paystack (${response.status}).`,
      response.status,
      response.status >= 500,
    );
  }

  const { status, message, code, data } = envelope.data;
  if (!response.ok || !status) {
    throw new PaystackRefundError(
      code ?? "request_failed",
      message ?? `Paystack refused the refund (${response.status}).`,
      response.status,
      response.status >= 500 || response.status === 429,
    );
  }

  const parsed = refundDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new PaystackRefundError(
      "bad_response",
      "Paystack returned refund details in an unexpected shape.",
      response.status,
    );
  }
  return toRefund(parsed.data);
}

/**
 * Asks Paystack to return money for a transaction. `amount` is integer kobo; left
 * out, Paystack refunds the whole transaction. The answer says whether the money
 * has gone back already ("processed") or is on its way ("pending"); banks can take
 * several working days, so a pending refund is normal and is followed up with
 * fetchRefund.
 */
export async function createRefund(input: { reference: string; amount?: number }): Promise<PaystackRefund> {
  const body: Record<string, string | number> = { transaction: input.reference };
  if (input.amount !== undefined) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new PaystackRefundError("bad_request", "A refund amount must be a whole number of kobo above zero.");
    }
    body.amount = input.amount;
  }
  return request("/refund", { method: "POST", body: JSON.stringify(body) });
}

/** What became of a refund Paystack already has. */
export async function fetchRefund(refundId: string): Promise<PaystackRefund> {
  return request(`/refund/${encodeURIComponent(refundId)}`, { method: "GET" });
}
