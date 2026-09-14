import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  createPaymentReference,
  evaluatePayment,
  isPaystackCheckoutUrl,
  verifyPaystackSignature,
  webhookEventKey,
  type PaystackTransaction,
} from "./paystack-core";

const secret = "sk_test_not_a_real_key";
const body = JSON.stringify({ event: "charge.success", data: { id: 42, reference: "TBT-ORD-2026-000001-abcd1234" } });
const sign = (payload: string, key = secret) => createHmac("sha512", key).update(payload).digest("hex");

describe("verifyPaystackSignature", () => {
  it("accepts the HMAC-SHA512 of the exact body", () => {
    assert.equal(verifyPaystackSignature(body, sign(body), secret), true);
    assert.equal(verifyPaystackSignature(body, sign(body).toUpperCase(), secret), true);
  });

  it("rejects a tampered body, a different key, and junk", () => {
    assert.equal(verifyPaystackSignature(body.replace("42", "43"), sign(body), secret), false);
    assert.equal(verifyPaystackSignature(body, sign(body, "sk_test_other"), secret), false);
    assert.equal(verifyPaystackSignature(body, "not-hex", secret), false);
    assert.equal(verifyPaystackSignature(body, sign(body).slice(0, 64), secret), false);
    assert.equal(verifyPaystackSignature(body, null, secret), false);
    assert.equal(verifyPaystackSignature(body, sign(body), ""), false);
  });
});

describe("evaluatePayment", () => {
  const expected = { reference: "TBT-ORD-2026-000001-abcd1234", amount: 132_500_00, currency: "NGN" };
  const transaction = (overrides: Partial<PaystackTransaction> = {}): PaystackTransaction => ({
    id: 1,
    domain: "test",
    status: "success",
    reference: expected.reference,
    amount: expected.amount,
    currency: "NGN",
    ...overrides,
  });

  it("confirms only an exact match", () => {
    assert.equal(evaluatePayment(expected, transaction()), "confirmed");
  });

  it("never confirms the wrong amount, currency or reference", () => {
    assert.equal(evaluatePayment(expected, transaction({ amount: 100 })), "amount_mismatch");
    assert.equal(evaluatePayment(expected, transaction({ amount: expected.amount + 1 })), "amount_mismatch");
    assert.equal(evaluatePayment(expected, transaction({ currency: "USD" })), "currency_mismatch");
    assert.equal(evaluatePayment(expected, transaction({ reference: "someone-else" })), "reference_mismatch");
  });

  it("maps Paystack's other statuses", () => {
    assert.equal(evaluatePayment(expected, transaction({ status: "failed" })), "failed");
    assert.equal(evaluatePayment(expected, transaction({ status: "reversed" })), "failed");
    assert.equal(evaluatePayment(expected, transaction({ status: "abandoned" })), "abandoned");
    for (const status of ["ongoing", "pending", "processing", "queued"]) {
      assert.equal(evaluatePayment(expected, transaction({ status })), "pending", status);
    }
  });
});

describe("identifiers", () => {
  it("makes a fresh, Paystack-safe reference per attempt", () => {
    const first = createPaymentReference("ORD-2026-000001");
    const second = createPaymentReference("ORD-2026-000001");
    assert.match(first, /^TBT-ORD-2026-000001-[0-9a-f]{8}$/);
    assert.notEqual(first, second);
  });

  it("keys webhooks by event and transaction", () => {
    assert.equal(webhookEventKey("charge.success", { id: 42, reference: "r" }), "paystack:charge.success:42");
    assert.equal(webhookEventKey("charge.success", { reference: "r" }), "paystack:charge.success:r");
  });

  it("only trusts Paystack's own checkout for redirects", () => {
    assert.equal(isPaystackCheckoutUrl("https://checkout.paystack.com/abc123"), true);
    assert.equal(isPaystackCheckoutUrl("http://checkout.paystack.com/abc123"), false);
    assert.equal(isPaystackCheckoutUrl("https://paystack.com.evil.example/abc"), false);
    assert.equal(isPaystackCheckoutUrl("javascript:alert(1)"), false);
  });
});
