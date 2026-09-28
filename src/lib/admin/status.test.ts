import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
  REVIEW_STATUS_OPTIONS,
  availableToSell,
  orderStatusDisplay,
  paymentStatusDisplay,
  productStatusDisplay,
  refundStatusDisplay,
  reviewStatusDisplay,
  stockDisplay,
} from "./status";

const now = new Date("2026-09-16T12:00:00.000Z");
const later = new Date(now.getTime() + 10 * 60_000);
const earlier = new Date(now.getTime() - 10 * 60_000);

describe("orderStatusDisplay", () => {
  it("names the fulfilment workflow in the owner's words", () => {
    const label = (status: Parameters<typeof orderStatusDisplay>[0]["status"]) =>
      orderStatusDisplay({ status, paymentStatus: "SUCCESS" }, now).label;
    assert.equal(label("PAID"), "To prepare");
    assert.equal(label("PROCESSING"), "Ready to ship");
    assert.equal(label("SHIPPED"), "Shipped");
    assert.equal(label("DELIVERED"), "Delivered");
    assert.equal(orderStatusDisplay({ status: "REFUNDED", paymentStatus: "REFUNDED" }, now).label, "Refunded");
  });

  it("asks for action only where the owner has something to do", () => {
    assert.equal(orderStatusDisplay({ status: "PAID", paymentStatus: "SUCCESS" }, now).tone, "attention");
    assert.equal(orderStatusDisplay({ status: "PROCESSING", paymentStatus: "SUCCESS" }, now).tone, "attention");
    assert.equal(orderStatusDisplay({ status: "SHIPPED", paymentStatus: "SUCCESS" }, now).tone, "info");
    assert.equal(orderStatusDisplay({ status: "DELIVERED", paymentStatus: "SUCCESS" }, now).tone, "positive");
  });

  it("tells an open hold from a lapsed one", () => {
    const open = orderStatusDisplay({ status: "PENDING", paymentStatus: "PENDING", reservedUntil: later }, now);
    assert.equal(open.label, "Awaiting payment");
    const lapsed = orderStatusDisplay(
      { status: "PENDING", paymentStatus: "PENDING", reservedUntil: earlier.toISOString() },
      now,
    );
    assert.equal(lapsed.label, "Payment window closed");
    assert.equal(orderStatusDisplay({ status: "PENDING", paymentStatus: "PENDING" }, now).label, "Awaiting payment");
    assert.equal(
      orderStatusDisplay({ status: "PENDING", paymentStatus: "PENDING", reservedUntil: "nonsense" }, now).label,
      "Awaiting payment",
    );
  });

  it("follows the payment where it is ahead of the order", () => {
    assert.equal(
      orderStatusDisplay({ status: "PENDING", paymentStatus: "SUCCESS", reservedUntil: earlier }, now).label,
      "Payment received",
    );
    const refundDue = orderStatusDisplay({ status: "CANCELLED", paymentStatus: "SUCCESS" }, now);
    assert.equal(refundDue.label, "Refund due");
    assert.equal(refundDue.tone, "critical");
    assert.equal(orderStatusDisplay({ status: "CANCELLED", paymentStatus: "ABANDONED" }, now).label, "Cancelled");
  });

  it("offers every status once, in workflow order", () => {
    assert.deepEqual(
      ORDER_STATUS_OPTIONS.map((option) => option.value),
      ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"],
    );
    assert.equal(ORDER_STATUS_OPTIONS[1].label, "To prepare");
  });
});

describe("payment, refund, product and review statuses", () => {
  it("marks test payments", () => {
    assert.equal(paymentStatusDisplay("SUCCESS").label, "Paid");
    assert.equal(paymentStatusDisplay("SUCCESS").tone, "positive");
    const test = paymentStatusDisplay("SUCCESS", true);
    assert.equal(test.label, "Paid (test)");
    assert.equal(test.tone, "info");
    assert.match(test.description, /no real money/);
    assert.equal(paymentStatusDisplay("FAILED", true).tone, "critical");
  });

  it("labels the rest", () => {
    assert.equal(refundStatusDisplay("PENDING").label, "Refund in progress");
    assert.equal(refundStatusDisplay("FAILED").tone, "critical");
    assert.equal(productStatusDisplay("ACTIVE").label, "Live");
    assert.equal(productStatusDisplay("DRAFT").label, "Draft");
    assert.equal(reviewStatusDisplay("PENDING").tone, "attention");
    assert.equal(PAYMENT_STATUS_OPTIONS.length, 5);
    assert.equal(PRODUCT_STATUS_OPTIONS.length, 3);
    assert.equal(REVIEW_STATUS_OPTIONS.length, 3);
  });
});

describe("stock", () => {
  it("counts what can be sold now", () => {
    assert.equal(availableToSell({ onHand: 10, reserved: 3, lowStockThreshold: 3 }), 7);
    assert.equal(availableToSell({ onHand: 2, reserved: 5, lowStockThreshold: 3 }), 0);
  });

  it("uses the storefront's low-stock rule", () => {
    assert.equal(stockDisplay({ onHand: 0, reserved: 0, lowStockThreshold: 3 }).label, "Sold out");
    assert.equal(stockDisplay({ onHand: 4, reserved: 4, lowStockThreshold: 3 }).label, "Sold out");
    const low = stockDisplay({ onHand: 5, reserved: 2, lowStockThreshold: 3 });
    assert.equal(low.label, "Low stock");
    assert.match(low.description, /^3 left to sell/);
    assert.equal(stockDisplay({ onHand: 5, reserved: 1, lowStockThreshold: 3 }).label, "In stock");
  });
});
