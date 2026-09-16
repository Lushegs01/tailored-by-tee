import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PAYMENT_IN_PROGRESS_MS,
  confirmationEmailDue,
  paymentStillInProgress,
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
});

describe("confirmationEmailDue", () => {
  it("sees to the email whenever the order ends up paid, including on a repeat settlement", () => {
    for (const outcome of ["paid", "paid_after_release", "already_paid"] as const) {
      assert.equal(confirmationEmailDue(outcome), true, outcome);
    }
  });

  it("never for a payment that didn't pay for the order", () => {
    const unpaid: SettleOutcome[] = ["needs_refund", "rejected", "failed", "abandoned", "pending", "unknown_reference"];
    for (const outcome of unpaid) assert.equal(confirmationEmailDue(outcome), false, outcome);
  });
});

describe("paymentStillInProgress", () => {
  const startedAt = new Date("2026-09-15T12:00:00.000Z");
  const after = (ms: number) => new Date(startedAt.getTime() + ms);

  it("holds back a new checkout while a recent payment is still going through", () => {
    assert.equal(paymentStillInProgress("pending", startedAt, after(60_000)), true);
    assert.equal(paymentStillInProgress("pending", startedAt, after(PAYMENT_IN_PROGRESS_MS - 1)), true);
  });

  it("lets the customer pay again once that attempt is old", () => {
    assert.equal(paymentStillInProgress("pending", startedAt, after(PAYMENT_IN_PROGRESS_MS)), false);
  });

  it("never for an attempt that has finished, one way or the other", () => {
    for (const outcome of ["paid", "already_paid", "failed", "abandoned", "rejected", "needs_refund"] as const) {
      assert.equal(paymentStillInProgress(outcome, startedAt, after(1_000)), false, outcome);
    }
  });
});
