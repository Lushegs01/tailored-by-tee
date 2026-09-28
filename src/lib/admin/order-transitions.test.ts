import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DeliveryMethod, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

import {
  ACTION_EVENT,
  ACTION_FROM,
  ACTION_TIMESTAMP,
  ACTION_TO,
  ORDER_ACTIONS,
  actionCopy,
  allowed,
  availableActions,
  deliveredWord,
  isOrderAction,
  isTroubleEvent,
  orderEventLabel,
  orderPath,
  refundOutcome,
  shippedWord,
  successMessage,
  type OrderAction,
  type OrderContext,
} from "./order-transitions";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

const PAYMENT_STATUSES: readonly PaymentStatus[] = ["PENDING", "SUCCESS", "FAILED", "ABANDONED", "REFUNDED"];

const METHODS: readonly DeliveryMethod[] = ["DELIVERY", "PICKUP"];

/** A context with nothing unusual about it; each test changes only what it cares about. */
function context(overrides: Partial<OrderContext> = {}): OrderContext {
  return {
    status: "PAID",
    paymentStatus: "SUCCESS",
    deliveryMethod: "DELIVERY",
    paid: true,
    refundInProgress: false,
    fullyRefunded: false,
    hasPaymentToCheck: true,
    ...overrides,
  };
}

/** An unpaid order still inside its hold. */
function unpaid(overrides: Partial<OrderContext> = {}): OrderContext {
  return context({ status: "PENDING", paymentStatus: "PENDING", paid: false, ...overrides });
}

function can(action: OrderAction, ctx: OrderContext): boolean {
  return allowed(action, ctx).ok;
}

/** Every combination the rules are asked about, so nothing is decided by accident. */
function everyContext(): OrderContext[] {
  const contexts: OrderContext[] = [];
  for (const status of ORDER_STATUSES) {
    for (const paymentStatus of PAYMENT_STATUSES) {
      for (const deliveryMethod of METHODS) {
        for (const paid of [true, false]) {
          for (const refundInProgress of [true, false]) {
            for (const fullyRefunded of [true, false]) {
              for (const hasPaymentToCheck of [true, false]) {
                contexts.push({
                  status,
                  paymentStatus,
                  deliveryMethod,
                  paid,
                  refundInProgress,
                  fullyRefunded,
                  hasPaymentToCheck,
                });
              }
            }
          }
        }
      }
    }
  }
  return contexts;
}

describe("the action list", () => {
  it("recognises exactly the seven steps", () => {
    assert.deepEqual([...ORDER_ACTIONS], [
      "start_processing",
      "mark_shipped",
      "mark_delivered",
      "cancel_unpaid",
      "cancel_paid",
      "refund",
      "recheck_payment",
    ]);
    for (const action of ORDER_ACTIONS) assert.equal(isOrderAction(action), true);
    assert.equal(isOrderAction("mark_paid"), false);
    assert.equal(isOrderAction(""), false);
  });

  it("has no step that marks a payment as successful", () => {
    const forbidden = /paid|payment_received|mark_paid/;
    for (const action of ORDER_ACTIONS) {
      if (action === "cancel_unpaid" || action === "cancel_paid") continue;
      assert.equal(forbidden.test(action), false, `${action} must not set payment state`);
    }
    // No step targets a payment status, only order statuses.
    for (const action of ORDER_ACTIONS) {
      const target = ACTION_TO[action];
      if (target !== null) assert.ok(ORDER_STATUSES.includes(target));
    }
  });

  it("gives every step a from-list, a target, a timestamp field and an event type", () => {
    for (const action of ORDER_ACTIONS) {
      assert.ok(ACTION_FROM[action].length > 0, action);
      assert.ok(action in ACTION_TO, action);
      assert.ok(action in ACTION_TIMESTAMP, action);
      assert.match(ACTION_EVENT[action], /^[a-z_]+$/, action);
    }
    assert.equal(ACTION_TIMESTAMP.mark_shipped, "shippedAt");
    assert.equal(ACTION_TIMESTAMP.mark_delivered, "deliveredAt");
    assert.equal(ACTION_TIMESTAMP.cancel_unpaid, "cancelledAt");
    assert.equal(ACTION_TIMESTAMP.cancel_paid, "cancelledAt");
    assert.equal(ACTION_TIMESTAMP.start_processing, null);
    assert.equal(ACTION_TIMESTAMP.refund, null);
    assert.equal(ACTION_TIMESTAMP.recheck_payment, null);
  });

  it("never allows a step from a status outside its own from-list", () => {
    for (const ctx of everyContext()) {
      for (const action of ORDER_ACTIONS) {
        if (!allowed(action, ctx).ok) continue;
        assert.ok(
          ACTION_FROM[action].includes(ctx.status),
          `${action} allowed from ${ctx.status}, which is not in its from-list`,
        );
      }
    }
  });

  it("always explains a refusal in a finished sentence", () => {
    for (const ctx of everyContext()) {
      for (const action of ORDER_ACTIONS) {
        const result = allowed(action, ctx);
        if (result.ok) continue;
        assert.ok(result.reason.length > 10, `${action}: ${result.reason}`);
        assert.match(result.reason, /[.]$/, `${action}: ${result.reason}`);
      }
    }
  });
});

describe("start_processing", () => {
  it("only moves a paid order to ready to ship", () => {
    assert.equal(can("start_processing", context({ status: "PAID" })), true);
    assert.equal(ACTION_TO.start_processing, "PROCESSING");
    for (const status of ORDER_STATUSES) {
      if (status === "PAID") continue;
      assert.equal(can("start_processing", context({ status })), false, status);
    }
  });

  it("says why when the order is unpaid or already being prepared", () => {
    const pending = allowed("start_processing", unpaid());
    assert.equal(pending.ok, false);
    assert.match(pending.ok ? "" : pending.reason, /hasn’t been paid/);

    const processing = allowed("start_processing", context({ status: "PROCESSING" }));
    assert.equal(processing.ok, false);
    assert.match(processing.ok ? "" : processing.reason, /already ready to ship/);
  });
});

describe("mark_shipped", () => {
  it("accepts a paid or prepared order and nothing else", () => {
    for (const status of ORDER_STATUSES) {
      const expected = status === "PAID" || status === "PROCESSING";
      assert.equal(can("mark_shipped", context({ status })), expected, status);
    }
    assert.equal(ACTION_TO.mark_shipped, "SHIPPED");
  });

  it("speaks of collection for a pickup order", () => {
    const shipped = allowed("mark_shipped", context({ status: "SHIPPED", deliveryMethod: "PICKUP" }));
    assert.equal(shipped.ok, false);
    assert.match(shipped.ok ? "" : shipped.reason, /ready for collection/);

    const delivery = allowed("mark_shipped", context({ status: "SHIPPED", deliveryMethod: "DELIVERY" }));
    assert.equal(delivery.ok, false);
    assert.match(delivery.ok ? "" : delivery.reason, /marked as shipped/);
  });

  it("refuses an order that is already delivered or collected", () => {
    for (const deliveryMethod of METHODS) {
      const result = allowed("mark_shipped", context({ status: "DELIVERED", deliveryMethod }));
      assert.equal(result.ok, false);
      assert.match(result.ok ? "" : result.reason, deliveryMethod === "PICKUP" ? /collected/ : /delivered/);
    }
  });
});

describe("mark_delivered", () => {
  it("only follows a shipped order", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(can("mark_delivered", context({ status })), status === "SHIPPED", status);
    }
    assert.equal(ACTION_TO.mark_delivered, "DELIVERED");
  });

  it("points at the missing step first", () => {
    const result = allowed("mark_delivered", context({ status: "PAID" }));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /Mark the order as shipped/);

    const pickup = allowed("mark_delivered", context({ status: "PAID", deliveryMethod: "PICKUP" }));
    assert.equal(pickup.ok, false);
    assert.match(pickup.ok ? "" : pickup.reason, /ready for collection/);
  });
});

describe("cancel_unpaid", () => {
  it("cancels only an order still waiting for payment", () => {
    assert.equal(can("cancel_unpaid", unpaid()), true);
    for (const status of ORDER_STATUSES) {
      if (status === "PENDING") continue;
      assert.equal(can("cancel_unpaid", context({ status, paid: false, paymentStatus: "PENDING" })), false, status);
    }
    assert.equal(ACTION_TO.cancel_unpaid, "CANCELLED");
  });

  it("never touches an order whose payment arrived", () => {
    for (const paymentStatus of PAYMENT_STATUSES) {
      const paid = paymentStatus === "SUCCESS";
      assert.equal(can("cancel_unpaid", unpaid({ paymentStatus, paid })), !paid, paymentStatus);
    }
    // A payment recorded on the order but not yet reflected in paymentStatus is still a payment.
    const result = allowed("cancel_unpaid", unpaid({ paid: true }));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /refund instead/);
  });
});

describe("cancel_paid", () => {
  it("cancels a paid order that hasn't left the studio", () => {
    assert.equal(can("cancel_paid", context({ status: "PAID" })), true);
    assert.equal(can("cancel_paid", context({ status: "PROCESSING" })), true);
    for (const status of ["PENDING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const) {
      assert.equal(can("cancel_paid", context({ status })), false, status);
    }
  });

  it("needs a confirmed payment", () => {
    const result = allowed("cancel_paid", context({ paid: false }));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /nothing to refund/);
  });

  it("sends a shipped order to a refund instead", () => {
    const result = allowed("cancel_paid", context({ status: "SHIPPED" }));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /Refund it instead/);
    const pickup = allowed("cancel_paid", context({ status: "SHIPPED", deliveryMethod: "PICKUP" }));
    assert.equal(pickup.ok, false);
    assert.match(pickup.ok ? "" : pickup.reason, /handed over/);
  });
});

describe("refund", () => {
  it("covers every status the money can be returned from", () => {
    for (const status of ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const) {
      assert.equal(can("refund", context({ status })), true, status);
    }
    for (const status of ["PENDING", "REFUNDED"] as const) {
      assert.equal(can("refund", context({ status })), false, status);
    }
  });

  it("refuses without a confirmed payment, whatever the status", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(can("refund", context({ status, paid: false })), false, status);
    }
  });

  it("refuses a second refund while one is with Paystack, and after a full refund", () => {
    const open = allowed("refund", context({ refundInProgress: true }));
    assert.equal(open.ok, false);
    assert.match(open.ok ? "" : open.reason, /already with Paystack/);

    const done = allowed("refund", context({ fullyRefunded: true }));
    assert.equal(done.ok, false);
    assert.match(done.ok ? "" : done.reason, /refunded in full/);
  });

  it("waits while a payment is still being confirmed", () => {
    const result = allowed("refund", context({ status: "PENDING", paid: true }));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /still being confirmed/);
  });

  it("changes no status by itself — Paystack's answer decides", () => {
    assert.equal(ACTION_TO.refund, null);
    assert.equal(ACTION_TIMESTAMP.refund, null);
  });
});

describe("recheck_payment", () => {
  it("only asks about an order still waiting for payment", () => {
    assert.equal(can("recheck_payment", unpaid()), true);
    for (const status of ORDER_STATUSES) {
      if (status === "PENDING") continue;
      assert.equal(can("recheck_payment", context({ status })), false, status);
    }
    assert.equal(ACTION_TO.recheck_payment, null);
  });

  it("needs an attempt to ask about", () => {
    const result = allowed("recheck_payment", unpaid({ hasPaymentToCheck: false }));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /No payment has been started/);
  });
});

describe("availableActions", () => {
  it("offers the fulfilment workflow one step at a time", () => {
    assert.deepEqual(availableActions(unpaid()), ["cancel_unpaid", "recheck_payment"]);
    assert.deepEqual(availableActions(context({ status: "PAID" })), [
      "start_processing",
      "mark_shipped",
      "cancel_paid",
      "refund",
    ]);
    assert.deepEqual(availableActions(context({ status: "PROCESSING" })), ["mark_shipped", "cancel_paid", "refund"]);
    assert.deepEqual(availableActions(context({ status: "SHIPPED" })), ["mark_delivered", "refund"]);
    assert.deepEqual(availableActions(context({ status: "DELIVERED" })), ["refund"]);
  });

  it("leaves nothing to do on a settled order", () => {
    assert.deepEqual(availableActions(context({ status: "REFUNDED", fullyRefunded: true })), []);
    assert.deepEqual(
      availableActions(context({ status: "CANCELLED", paid: false, paymentStatus: "ABANDONED" })),
      [],
    );
  });

  it("offers a refund on a cancelled order the customer paid for", () => {
    assert.deepEqual(availableActions(context({ status: "CANCELLED", paid: true })), ["refund"]);
  });

  it("offers nothing while a refund is with Paystack", () => {
    assert.deepEqual(availableActions(context({ status: "DELIVERED", refundInProgress: true })), []);
  });
});

describe("the words", () => {
  it("gives every step a label, a question and a confirm button, per delivery method", () => {
    for (const action of ORDER_ACTIONS) {
      for (const deliveryMethod of METHODS) {
        const copy = actionCopy(action, deliveryMethod);
        assert.ok(copy.label.length > 0, action);
        assert.match(copy.title, /\?$/, `${action} (${deliveryMethod})`);
        assert.match(copy.description, /[.]$/, `${action} (${deliveryMethod})`);
        assert.ok(copy.confirmLabel.length > 0, action);
        assert.notEqual(copy.confirmLabel.toLowerCase(), "ok");
        assert.ok(copy.pendingLabel.endsWith("…"), action);
      }
    }
  });

  it("marks the three destructive steps and no others", () => {
    const destructive = ORDER_ACTIONS.filter((action) => actionCopy(action, "DELIVERY").tone === "destructive");
    assert.deepEqual(destructive, ["cancel_unpaid", "cancel_paid", "refund"]);
  });

  it("never says “shipped” about a collection order", () => {
    for (const action of ORDER_ACTIONS) {
      const copy = actionCopy(action, "PICKUP");
      const text = `${copy.label} ${copy.title} ${copy.description} ${copy.confirmLabel}`;
      assert.equal(/ship/i.test(text), false, `${action}: ${text}`);
    }
    assert.equal(shippedWord("PICKUP"), "ready for collection");
    assert.equal(shippedWord("DELIVERY"), "shipped");
    assert.equal(deliveredWord("PICKUP"), "collected");
    assert.equal(deliveredWord("DELIVERY"), "delivered");
  });

  it("confirms each step by name", () => {
    assert.equal(successMessage("mark_shipped", "DELIVERY", "ORD-2026-000012"), "ORD-2026-000012 is marked as shipped.");
    assert.equal(
      successMessage("mark_shipped", "PICKUP", "ORD-2026-000012"),
      "ORD-2026-000012 is ready for collection.",
    );
    assert.equal(
      successMessage("mark_delivered", "PICKUP", "ORD-2026-000012"),
      "ORD-2026-000012 is marked as collected.",
    );
    for (const action of ORDER_ACTIONS) {
      for (const deliveryMethod of METHODS) {
        const message = successMessage(action, deliveryMethod, "ORD-2026-000012");
        assert.ok(message.includes("ORD-2026-000012"), action);
        assert.match(message, /[.]$/, action);
      }
    }
  });

  it("builds an order's path from its number", () => {
    assert.equal(orderPath("ORD-2026-000012"), "/admin/orders/ORD-2026-000012");
    assert.equal(orderPath("ORD 12/A"), "/admin/orders/ORD%2012%2FA");
  });
});

describe("refundOutcome", () => {
  it("reads Paystack's own words", () => {
    assert.equal(refundOutcome("processed"), "processed");
    assert.equal(refundOutcome("Processed"), "processed");
    assert.equal(refundOutcome(" success "), "processed");
    assert.equal(refundOutcome("failed"), "failed");
    assert.equal(refundOutcome("pending"), "pending");
    assert.equal(refundOutcome("processing"), "pending");
    assert.equal(refundOutcome("awaiting-approval"), "pending");
  });

  it("treats anything it doesn't know as still pending", () => {
    assert.equal(refundOutcome("something-new"), "pending");
    assert.equal(refundOutcome(""), "pending");
  });
});

describe("the timeline", () => {
  it("names the events the rest of the site writes", () => {
    assert.equal(orderEventLabel("order_placed", "DELIVERY"), "Order placed");
    assert.equal(orderEventLabel("payment_confirmed", "DELIVERY"), "Payment confirmed");
    assert.equal(orderEventLabel("order_released", "DELIVERY"), "Hold released");
    assert.equal(orderEventLabel("duplicate_payment", "DELIVERY"), "A second payment arrived");
    assert.equal(orderEventLabel("confirmation_emailed", "DELIVERY"), "Confirmation emailed");
  });

  it("names its own events, and reads them for collection orders", () => {
    for (const action of ["start_processing", "mark_shipped", "mark_delivered", "cancel_unpaid"] as const) {
      const label = orderEventLabel(ACTION_EVENT[action], "DELIVERY");
      assert.ok(label.length > 0 && label[0] === label[0].toUpperCase(), action);
    }
    assert.equal(orderEventLabel("order_shipped", "PICKUP"), "Ready for collection");
    assert.equal(orderEventLabel("order_delivered", "PICKUP"), "Marked as collected");
    assert.equal(orderEventLabel("order_shipped", "DELIVERY"), "Marked as shipped");
  });

  it("makes an unknown event readable rather than raw", () => {
    assert.equal(orderEventLabel("payment_queued", "DELIVERY"), "Payment queued");
    assert.equal(orderEventLabel("", "DELIVERY"), "Change");
  });

  it("names the status emails, whichever step they belong to", () => {
    for (const kind of ["shipped", "ready_for_collection", "delivered", "collected"]) {
      assert.equal(orderEventLabel(`status_emailed_${kind}`, "DELIVERY"), "Update emailed");
      assert.equal(orderEventLabel(`status_email_failed_${kind}`, "DELIVERY"), "Update email failed");
      assert.equal(orderEventLabel(`status_email_refused_${kind}`, "DELIVERY"), "Update email refused");
      assert.equal(isTroubleEvent(`status_emailed_${kind}`), false);
      assert.equal(isTroubleEvent(`status_email_failed_${kind}`), true);
      assert.equal(isTroubleEvent(`status_email_refused_${kind}`), true);
    }
  });

  it("marks the entries that mean trouble", () => {
    assert.equal(isTroubleEvent("refund_failed"), true);
    assert.equal(isTroubleEvent("duplicate_payment"), true);
    assert.equal(isTroubleEvent("payment_needs_refund"), true);
    assert.equal(isTroubleEvent("order_shipped"), false);
    assert.equal(isTroubleEvent("note"), false);
  });
});
