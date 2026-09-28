import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AWAITING_CUSTOMER_MS,
  PAYMENT_IN_PROGRESS_MS,
  confirmationEmailDue,
  paymentInProgressMessage,
  paymentRetryDelay,
  settlementPath,
  type SettleOutcome,
} from "./settlement";

describe("settlementPath", () => {
  it("sells the held pieces while the order is still pending, even past its deadline", () => {
    assert.equal(settlementPath("PENDING"), "promote");
  });

  it("takes the after-release path once a sweep has released the hold", () => {
    // Also the answer on the re-read after a promote that lost the race to a sweep.
    assert.equal(settlementPath("CANCELLED"), "after_release");
  });

  it("treats an order another payment already paid for as a duplicate", () => {
    for (const status of ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED"]) {
      assert.equal(settlementPath(status), "duplicate", status);
    }
  });

  it("refunds the second of two late payments racing for a released order", () => {
    // The first takes the order back (CANCELLED → PAID); the second's conditional claim matches
    // nothing, and its re-read must send it to the refund, never to selling the pieces again.
    const first = settlementPath("CANCELLED");
    const second = settlementPath("PAID");
    assert.equal(first, "after_release");
    assert.equal(second, "duplicate");
  });
});

describe("confirmationEmailDue", () => {
  it("sees to the email whenever the order ends up paid, including on a repeat settlement", () => {
    for (const outcome of ["paid", "paid_after_release", "already_paid"] as const) {
      assert.equal(confirmationEmailDue(outcome), true, outcome);
    }
  });

  it("never for a payment that didn't pay for the order", () => {
    const unpaid: SettleOutcome[] = [
      "needs_refund",
      "rejected",
      "failed",
      "abandoned",
      "awaiting_customer",
      "pending",
      "unknown_reference",
    ];
    for (const outcome of unpaid) assert.equal(confirmationEmailDue(outcome), false, outcome);
  });
});

describe("paymentRetryDelay", () => {
  const startedAt = new Date("2026-09-15T12:00:00.000Z");
  const after = (ms: number) => new Date(startedAt.getTime() + ms);

  it("holds back a new checkout for the rest of a few minutes while a payment is going through", () => {
    assert.equal(paymentRetryDelay("pending", startedAt, after(60_000)), PAYMENT_IN_PROGRESS_MS - 60_000);
    assert.equal(paymentRetryDelay("pending", startedAt, after(PAYMENT_IN_PROGRESS_MS - 1)), 1);
  });

  it("holds back for less while Paystack is only waiting on the shopper", () => {
    assert.ok(AWAITING_CUSTOMER_MS < PAYMENT_IN_PROGRESS_MS);
    assert.equal(paymentRetryDelay("awaiting_customer", startedAt, after(60_000)), AWAITING_CUSTOMER_MS - 60_000);
    assert.equal(paymentRetryDelay("awaiting_customer", startedAt, after(AWAITING_CUSTOMER_MS)), 0);
  });

  it("lets the customer pay again once that attempt is a few minutes old", () => {
    assert.equal(paymentRetryDelay("pending", startedAt, after(PAYMENT_IN_PROGRESS_MS)), 0);
    assert.equal(paymentRetryDelay("pending", startedAt, after(60 * 60_000)), 0);
    // A small part of the order's hold, so walking away from one checkout never costs the order.
    assert.ok(PAYMENT_IN_PROGRESS_MS <= 5 * 60_000);
  });

  it("never for an attempt that has finished, one way or the other", () => {
    for (const outcome of ["paid", "already_paid", "failed", "abandoned", "rejected", "needs_refund"] as const) {
      assert.equal(paymentRetryDelay(outcome, startedAt, after(1_000)), 0, outcome);
    }
  });
});

describe("paymentInProgressMessage", () => {
  it("says when to look again, rounded up to whole minutes", () => {
    assert.match(paymentInProgressMessage(90_000), /in about 2 minutes/);
    assert.match(paymentInProgressMessage(4 * 60_000 + 1), /in about 5 minutes/);
  });

  it("never promises less than a minute", () => {
    assert.match(paymentInProgressMessage(1), /in about a minute/);
    assert.match(paymentInProgressMessage(60_000), /in about a minute/);
  });
});
