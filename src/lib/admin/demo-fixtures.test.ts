import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteConfig } from "@/config/site";
import { findState } from "@/config/nigeria";
import { normalizeNigerianPhone } from "@/lib/commerce/phone";

import {
  DEMO_CUSTOMERS,
  DEMO_EMAIL_DOMAIN,
  DEMO_ORDER_PLAN,
  DEMO_REVIEWS,
  VERIFIED_REVIEW_MARGIN_DAYS,
  ordersSupportingReview,
  chooseDemoLines,
  createDemoRandom,
  demoCustomer,
  demoCustomerJoinedAt,
  demoEmail,
  demoOrderEvents,
  demoOrderId,
  demoOrderNumber,
  demoOrderTotals,
  demoOrderWasPaid,
  demoPaymentReference,
  demoPaymentStatus,
  demoPlacedAt,
  demoPlanProblems,
  demoRefundAmount,
  demoTimeline,
  demoUserId,
  isDemoEmail,
  isDemoOrderNumber,
  lagosCalendarParts,
  lagosDaysAgo,
  lagosInstant,
  summariseDemoPlan,
  type DemoOrderSpec,
} from "./demo-fixtures";

/** A fixed moment to reason about: 20 Sep 2026, 14:30 Lagos time. */
const NOW = lagosInstant(2026, 9, 20, 14, 30);

describe("demo marks", () => {
  it("numbers demo orders apart from the shop's own ORD- counter", () => {
    assert.equal(demoOrderNumber(2026, 1), "DEMO-2026-000001");
    assert.equal(demoOrderNumber(2026, 30), "DEMO-2026-000030");
    assert.ok(isDemoOrderNumber("DEMO-2026-000001"));
    assert.ok(!isDemoOrderNumber("ORD-2026-001284"));
    assert.ok(!isDemoOrderNumber("DEMO-2026-1"));
    assert.ok(!isDemoOrderNumber(" DEMO-2026-000001"));
  });

  it("addresses every demo customer on the reserved documentation domain", () => {
    assert.equal(DEMO_EMAIL_DOMAIN, "example.com");
    for (const customer of DEMO_CUSTOMERS) {
      assert.equal(demoEmail(customer.key), `demo.${customer.key}@example.com`);
      assert.ok(isDemoEmail(demoEmail(customer.key)));
    }
    assert.ok(!isDemoEmail("owner@tailoredbytee.com"));
  });

  it("gives every row an id that says it is demo data", () => {
    assert.ok(demoUserId("adaeze").startsWith("demo_"));
    assert.ok(demoOrderId(2026, 7).startsWith("demo_"));
    assert.equal(demoOrderId(2026, 7), "demo_order_2026_000007");
    assert.ok(demoPaymentReference("DEMO-2026-000007", 2).startsWith("DEMO-"));
  });
});

describe("demo customers", () => {
  it("has eight, a mix of accounts and guests", () => {
    assert.equal(DEMO_CUSTOMERS.length, 8);
    const registered = DEMO_CUSTOMERS.filter((customer) => customer.registered).length;
    assert.ok(registered > 0 && registered < DEMO_CUSTOMERS.length);
  });

  it("uses keys that are unique and safe in ids and emails", () => {
    const keys = new Set(DEMO_CUSTOMERS.map((customer) => customer.key));
    assert.equal(keys.size, DEMO_CUSTOMERS.length);
    for (const customer of DEMO_CUSTOMERS) assert.match(customer.key, /^[a-z]+$/);
  });

  it("gives everyone a phone number checkout would accept", () => {
    for (const customer of DEMO_CUSTOMERS) {
      assert.equal(normalizeNigerianPhone(customer.phone), customer.phone, customer.key);
    }
  });

  it("delivers to real Nigerian states, spread across more than one zone", () => {
    const states = new Set<string>();
    for (const customer of DEMO_CUSTOMERS) {
      assert.ok(findState(customer.address.state), `${customer.key}: ${customer.address.state}`);
      states.add(customer.address.state);
    }
    assert.ok(states.size >= 4);
  });

  it("looks up a customer by key and refuses an unknown one", () => {
    assert.equal(demoCustomer("adaeze").name, "Adaeze Okonkwo");
    assert.throws(() => demoCustomer("nobody"), RangeError);
  });

  it("opens every account before that customer's first order", () => {
    DEMO_CUSTOMERS.forEach((customer, index) => {
      if (!customer.registered) return;
      const first = DEMO_ORDER_PLAN.find((spec) => spec.customer === customer.key);
      assert.ok(first, `${customer.key} has no orders`);
      const joined = demoCustomerJoinedAt(NOW, index);
      assert.ok(joined.getTime() < demoPlacedAt(NOW, first).getTime(), `${customer.key} ordered before joining`);
      assert.ok(joined.getTime() < NOW.getTime(), `${customer.key} joined in the future`);
    });
  });
});

describe("the order plan", () => {
  it("is internally consistent", () => {
    assert.deepEqual(demoPlanProblems(), []);
  });

  it("covers every status the admin has to show", () => {
    const summary = summariseDemoPlan();
    assert.equal(summary.orders, 30);
    for (const [status, count] of Object.entries(summary.ordersByStatus)) {
      assert.ok(count > 0, `no demo order is ${status}`);
    }
  });

  it("includes a refund owed and a refund already paid back", () => {
    const owed = DEMO_ORDER_PLAN.filter((spec) => spec.status === "CANCELLED" && spec.paidBeforeCancel);
    const processed = DEMO_ORDER_PLAN.filter((spec) => spec.refund?.status === "PROCESSED");
    assert.ok(owed.length >= 1);
    assert.ok(processed.length >= 1);
    // One owed refund has no record yet and one is under way, so both read differently on the overview.
    assert.ok(owed.some((spec) => !spec.refund));
    assert.ok(owed.some((spec) => spec.refund?.status === "PENDING"));
  });

  it("names a customer that exists for every order", () => {
    for (const spec of DEMO_ORDER_PLAN) assert.doesNotThrow(() => demoCustomer(spec.customer));
  });

  it("gives each order its own number and id", () => {
    const numbers = new Set(DEMO_ORDER_PLAN.map((spec) => demoOrderNumber(2026, spec.sequence)));
    assert.equal(numbers.size, DEMO_ORDER_PLAN.length);
  });
});

describe("Lagos time", () => {
  it("reads and writes wall-clock times at UTC+1", () => {
    assert.equal(lagosInstant(2026, 9, 20, 14, 30).toISOString(), "2026-09-20T13:30:00.000Z");
    assert.deepEqual(lagosCalendarParts(NOW), { year: 2026, month: 9, day: 20 });
    // Just after midnight in Lagos is still the previous day in UTC.
    assert.deepEqual(lagosCalendarParts(new Date("2026-09-20T23:30:00.000Z")), { year: 2026, month: 9, day: 21 });
  });

  it("counts whole days back from today", () => {
    const at = lagosDaysAgo(NOW, 7, 9, 15);
    assert.deepEqual(lagosCalendarParts(at), { year: 2026, month: 9, day: 13 });
    assert.equal(at.toISOString(), "2026-09-13T08:15:00.000Z");
  });
});

describe("order timelines", () => {
  const specFor = (sequence: number): DemoOrderSpec => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.sequence === sequence);
    assert.ok(spec, `no order ${sequence}`);
    return spec;
  };

  it("never dates something that has happened in the future", () => {
    for (const spec of DEMO_ORDER_PLAN) {
      const timeline = demoTimeline(NOW, spec);
      for (const [name, value] of Object.entries(timeline)) {
        // reservedUntil is a deadline, not a record: a live hold runs out later today.
        if (name === "reservedUntil" || !(value instanceof Date)) continue;
        assert.ok(value.getTime() < NOW.getTime(), `order ${spec.sequence}: ${name}`);
      }
    }
  });

  it("keeps every step in order", () => {
    for (const spec of DEMO_ORDER_PLAN) {
      const t = demoTimeline(NOW, spec);
      const steps = [t.placedAt, t.failedPaymentAt, t.paidAt, t.processingAt, t.shippedAt, t.deliveredAt, t.refundedAt]
        .filter((value): value is Date => value !== null)
        .map((value) => value.getTime());
      const sorted = [...steps].sort((a, b) => a - b);
      assert.deepEqual(steps, sorted, `order ${spec.sequence} runs out of order`);
    }
  });

  it("holds stock for unpaid orders, and lets it go once paid", () => {
    const live = demoTimeline(NOW, specFor(29));
    assert.ok(live.reservedUntil);
    assert.ok(!live.holdLapsed);
    assert.ok(live.reservedUntil.getTime() > NOW.getTime());

    const lapsed = demoTimeline(NOW, specFor(28));
    assert.ok(lapsed.holdLapsed);
    assert.ok(lapsed.reservedUntil && lapsed.reservedUntil.getTime() < NOW.getTime());

    const paid = demoTimeline(NOW, specFor(21));
    assert.equal(paid.reservedUntil, null);
    assert.ok(paid.paidAt);
  });

  it("holds for exactly the configured window", () => {
    const timeline = demoTimeline(NOW, specFor(30));
    assert.ok(timeline.reservedUntil);
    assert.equal(
      timeline.reservedUntil.getTime() - timeline.placedAt.getTime(),
      siteConfig.commerce.reservationMinutes * 60_000,
    );
  });

  it("never dispatches an order that is being collected", () => {
    for (const spec of DEMO_ORDER_PLAN.filter((entry) => entry.delivery === "pickup")) {
      assert.equal(demoTimeline(NOW, spec).shippedAt, null, `order ${spec.sequence}`);
    }
  });

  it("treats a refunded order as a completed sale first", () => {
    const timeline = demoTimeline(NOW, specFor(5));
    assert.ok(timeline.paidAt && timeline.deliveredAt && timeline.refundedAt);
    assert.ok(timeline.refundedAt.getTime() > timeline.deliveredAt.getTime());
  });
});

describe("payment state", () => {
  it("matches what actually happened to the money", () => {
    const of = (sequence: number) => {
      const spec = DEMO_ORDER_PLAN.find((entry) => entry.sequence === sequence);
      assert.ok(spec);
      return demoPaymentStatus(spec, demoTimeline(NOW, spec).holdLapsed);
    };
    assert.equal(of(21), "SUCCESS"); // paid
    assert.equal(of(5), "REFUNDED"); // refunded
    assert.equal(of(14), "SUCCESS"); // cancelled after paying — the refund is still owed
    assert.equal(of(3), "ABANDONED"); // cancelled without paying
    assert.equal(of(29), "PENDING"); // hold still live
    assert.equal(of(28), "ABANDONED"); // hold lapsed
  });

  it("agrees with whether the order was paid at all", () => {
    for (const spec of DEMO_ORDER_PLAN) {
      const paid = demoOrderWasPaid(spec);
      const status = demoPaymentStatus(spec, demoTimeline(NOW, spec).holdLapsed);
      assert.equal(paid, status === "SUCCESS" || status === "REFUNDED", `order ${spec.sequence}`);
    }
  });
});

describe("timeline entries", () => {
  it("always starts with the order being placed and runs forwards", () => {
    for (const spec of DEMO_ORDER_PLAN) {
      const timeline = demoTimeline(NOW, spec);
      const events = demoOrderEvents(spec, timeline, {
        orderNumber: demoOrderNumber(2026, spec.sequence),
        reference: "DEMO-2026-000001-P1",
        trackingNumber: "DEMO-TRK-2026-000001",
        carrier: "Demo Couriers",
      });
      assert.equal(events[0].type, "order_placed", `order ${spec.sequence}`);
      for (let index = 1; index < events.length; index += 1) {
        assert.ok(
          events[index].createdAt.getTime() >= events[index - 1].createdAt.getTime(),
          `order ${spec.sequence}: entries out of order`,
        );
      }
    }
  });

  it("records the declined attempt before the one that worked", () => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.failedAttempt);
    assert.ok(spec);
    const events = demoOrderEvents(spec, demoTimeline(NOW, spec), {
      orderNumber: demoOrderNumber(2026, spec.sequence),
      reference: null,
      trackingNumber: null,
      carrier: null,
    });
    const types = events.map((event) => event.type);
    assert.ok(types.indexOf("payment_rejected") < types.indexOf("payment_confirmed"));
  });

  it("says the money still has to go back when a paid order was cancelled", () => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.status === "CANCELLED" && entry.paidBeforeCancel);
    assert.ok(spec);
    const events = demoOrderEvents(spec, demoTimeline(NOW, spec), {
      orderNumber: demoOrderNumber(2026, spec.sequence),
      reference: null,
      trackingNumber: null,
      carrier: null,
    });
    const cancelled = events.find((event) => event.type === "order_cancelled");
    assert.ok(cancelled, "a paid order is cancelled by hand, not released");
    // It was PAID at the moment it was cancelled, which is why a refund is owed.
    assert.equal(cancelled.fromStatus, "PAID");
    assert.match(cancelled.note, /go back to the customer/);
  });

  it("releases the hold, rather than cancelling, when nothing was paid", () => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.status === "CANCELLED" && !entry.paidBeforeCancel);
    assert.ok(spec);
    const events = demoOrderEvents(spec, demoTimeline(NOW, spec), {
      orderNumber: demoOrderNumber(2026, spec.sequence),
      reference: null,
      trackingNumber: null,
      carrier: null,
    });
    const released = events.find((event) => event.type === "order_released");
    assert.ok(released);
    assert.equal(released.fromStatus, "PENDING");
    assert.equal(released.toStatus, "CANCELLED");
  });

  it("asks for a refund before recording that it went through", () => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.refund?.status === "PROCESSED");
    assert.ok(spec);
    const events = demoOrderEvents(spec, demoTimeline(NOW, spec), {
      orderNumber: demoOrderNumber(2026, spec.sequence),
      reference: null,
      trackingNumber: null,
      carrier: null,
    });
    const types = events.map((event) => event.type);
    assert.ok(types.includes("refund_requested"));
    assert.ok(types.indexOf("refund_requested") < types.indexOf("refund_processed"));
  });

  it("leaves a refund still with Paystack unconfirmed", () => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.refund?.status === "PENDING");
    assert.ok(spec);
    const types = demoOrderEvents(spec, demoTimeline(NOW, spec), {
      orderNumber: demoOrderNumber(2026, spec.sequence),
      reference: null,
      trackingNumber: null,
      carrier: null,
    }).map((event) => event.type);
    assert.ok(types.includes("refund_pending"));
    assert.ok(!types.includes("refund_processed"), "the money hasn't reached the customer yet");
  });

  /*
   * The admin timeline gives each of these its own wording (EVENT_LABELS in
   * src/lib/admin/order-transitions.ts); anything else would show as a tidied-up
   * raw type. Kept as a plain list rather than an import, so this slice doesn't
   * depend on another one's internals — but if a type here is ever changed, check
   * that file has words for the new one.
   */
  const KNOWN_TYPES = new Set([
    "order_placed",
    "payment_rejected",
    "payment_confirmed",
    "processing_started",
    "order_shipped",
    "order_delivered",
    "order_cancelled",
    "order_released",
    "refund_requested",
    "refund_pending",
    "refund_processed",
    "refund_failed",
  ]);

  it("only uses entry types the admin timeline has its own words for", () => {
    const used = new Set<string>();
    for (const spec of DEMO_ORDER_PLAN) {
      const events = demoOrderEvents(spec, demoTimeline(NOW, spec), {
        orderNumber: demoOrderNumber(2026, spec.sequence),
        reference: "DEMO-2026-000001-P1",
        trackingNumber: "DEMO-TRK-2026-000001",
        carrier: "Demo Couriers",
      });
      for (const event of events) {
        assert.ok(KNOWN_TYPES.has(event.type), `order ${spec.sequence}: unknown entry type "${event.type}"`);
        used.add(event.type);
      }
    }
    // Every step the admin has to read is actually exercised by the demo store.
    for (const type of ["order_placed", "payment_confirmed", "processing_started", "order_shipped", "order_delivered", "order_cancelled", "order_released", "refund_processed", "refund_pending"]) {
      assert.ok(used.has(type), `no demo order records "${type}"`);
    }
  });
});

describe("money", () => {
  it("prices delivery and the total exactly as checkout does", () => {
    const money = demoOrderTotals({ lineTotals: [48_000_00, 22_000_00], discount: 0, method: "delivery", stateCode: "LA" });
    assert.equal(money.subtotal, 70_000_00);
    assert.equal(money.discountTotal, 0);
    assert.equal(money.shippingTotal, 3_500_00);
    assert.equal(money.total, 73_500_00);
    assert.equal(money.delivery?.zoneId, "lagos");
  });

  it("charges nothing to collect from the studio", () => {
    const money = demoOrderTotals({ lineTotals: [48_000_00], discount: 0, method: "pickup", stateCode: null });
    assert.equal(money.shippingTotal, 0);
    assert.equal(money.total, 48_000_00);
  });

  it("measures the free-delivery threshold after the discount, like checkout", () => {
    const threshold = siteConfig.commerce.freeDeliveryThreshold;
    const lineTotals = [threshold + 1_000_00];
    assert.equal(demoOrderTotals({ lineTotals, discount: 0, method: "delivery", stateCode: "LA" }).shippingTotal, 0);
    // A discount that drops the bag under the threshold brings the fee back.
    const discounted = demoOrderTotals({ lineTotals, discount: 5_000_00, method: "delivery", stateCode: "LA" });
    assert.equal(discounted.shippingTotal, 3_500_00);
  });

  it("keeps the identity the database enforces", () => {
    const money = demoOrderTotals({ lineTotals: [10_000_00], discount: 30_000_00, method: "delivery", stateCode: "OG" });
    assert.equal(money.discountTotal, money.subtotal);
    assert.equal(money.total, money.subtotal - money.discountTotal + money.shippingTotal);
  });

  it("refunds the whole total, or roughly one line of it", () => {
    const full: DemoOrderSpec = { ...DEMO_ORDER_PLAN[4], refund: { status: "PROCESSED", partial: false, reason: "x" } };
    const part: DemoOrderSpec = { ...DEMO_ORDER_PLAN[4], refund: { status: "PROCESSED", partial: true, reason: "x" } };
    assert.equal(demoRefundAmount(full, 73_500_00, 22_000_00), 73_500_00);
    assert.equal(demoRefundAmount(part, 73_500_00, 22_000_00), 22_000_00);
    assert.ok(demoRefundAmount(part, 73_500_00, 0) > 0, "a refund is always for more than nothing");
  });
});

describe("repeatable randomness", () => {
  it("gives the same store on every run", () => {
    const first = Array.from({ length: 10 }, (_, index) => createDemoRandom(index).int(1, 1000));
    const second = Array.from({ length: 10 }, (_, index) => createDemoRandom(index).int(1, 1000));
    assert.deepEqual(first, second);
  });

  it("stays inside the range it was given", () => {
    const random = createDemoRandom(42);
    for (let index = 0; index < 500; index += 1) {
      const value = random.int(3, 7);
      assert.ok(value >= 3 && value <= 7 && Number.isInteger(value));
    }
  });

  it("never puts the same piece in an order twice", () => {
    const candidates = ["a", "b", "c", "d", "e"];
    for (let seed = 0; seed < 50; seed += 1) {
      const picks = chooseDemoLines(createDemoRandom(seed), candidates, 3, 2);
      assert.equal(picks.length, 3);
      assert.equal(new Set(picks.map((pick) => pick.item)).size, 3);
      for (const pick of picks) assert.ok(pick.quantity >= 1 && pick.quantity <= 2);
    }
  });

  it("asks for no more than the shop has", () => {
    const picks = chooseDemoLines(createDemoRandom(1), ["only"], 3, 2);
    assert.equal(picks.length, 1);
    assert.deepEqual(chooseDemoLines(createDemoRandom(1), [], 2, 2), []);
  });
});

describe("reviews", () => {
  it("has fifteen, with some still waiting", () => {
    const summary = summariseDemoPlan();
    assert.equal(summary.reviews, 15);
    assert.ok(summary.reviewsByStatus.PENDING >= 3);
    assert.ok(summary.reviewsByStatus.APPROVED >= 1);
    assert.ok(summary.reviewsByStatus.REJECTED >= 1);
  });

  it("rates between two and five stars, as the plan promises", () => {
    for (const review of DEMO_REVIEWS) assert.ok(review.rating >= 2 && review.rating <= 5, review.key);
    const ratings = new Set(DEMO_REVIEWS.map((review) => review.rating));
    assert.ok(ratings.size >= 3, "the ratings should not all be the same");
  });

  it("gives each review its own key", () => {
    assert.equal(new Set(DEMO_REVIEWS.map((review) => review.key)).size, DEMO_REVIEWS.length);
  });

  it("shows both a verified and an unverified review", () => {
    assert.ok(DEMO_REVIEWS.some((review) => review.verified));
    assert.ok(DEMO_REVIEWS.some((review) => !review.verified));
  });

  it("never claims a verified purchase the customer hadn't yet made", () => {
    for (const review of DEMO_REVIEWS.filter((entry) => entry.verified)) {
      const supporting = ordersSupportingReview(review);
      assert.ok(supporting.length > 0, `review ${review.key} has no purchase behind it`);
      for (const spec of supporting) {
        assert.equal(spec.customer, review.customer);
        assert.ok(demoOrderWasPaid(spec), `order ${spec.sequence} was never paid for`);
        // Placed early enough that the piece had arrived before the review was written.
        assert.ok(spec.daysAgo >= review.daysAgo + VERIFIED_REVIEW_MARGIN_DAYS);
      }
    }
  });

  it("finds no purchase behind a review written before the customer ever bought", () => {
    const template = DEMO_REVIEWS[0];
    const firstPaid = DEMO_ORDER_PLAN.filter((spec) => spec.customer === template.customer && demoOrderWasPaid(spec)).reduce(
      (oldest, spec) => Math.max(oldest, spec.daysAgo),
      0,
    );

    // Written the day before that order was placed: nothing can back it.
    const tooEarly = { ...template, daysAgo: firstPaid + 1 };
    assert.deepEqual(ordersSupportingReview(tooEarly), []);

    // Written well after it: the order stands behind it.
    const later = { ...template, daysAgo: firstPaid - VERIFIED_REVIEW_MARGIN_DAYS };
    assert.ok(ordersSupportingReview(later).length > 0);
  });
});

describe("placing times", () => {
  it("times orders awaiting payment in minutes, so their hold is deliberate", () => {
    const spec = DEMO_ORDER_PLAN.find((entry) => entry.minutesAgo !== undefined);
    assert.ok(spec?.minutesAgo !== undefined);
    assert.equal(demoPlacedAt(NOW, spec).getTime(), NOW.getTime() - spec.minutesAgo * 60_000);
  });

  it("pulls a same-day order back rather than dating it in the future", () => {
    const spec: DemoOrderSpec = { ...DEMO_ORDER_PLAN[0], daysAgo: 0, hour: 23, minute: 59, minutesAgo: undefined };
    assert.ok(demoPlacedAt(NOW, spec).getTime() < NOW.getTime());
  });
});
