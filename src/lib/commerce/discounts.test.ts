import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateCoupon, normalizeCouponCode, type CouponRule, type DiscountLine } from "./discounts";

const now = new Date("2026-09-14T12:00:00Z");

function rule(overrides: Partial<CouponRule> = {}): CouponRule {
  return {
    id: "cpn_1",
    code: "WELCOME10",
    description: "10% off",
    type: "percentage",
    value: 10,
    minSubtotal: null,
    maxDiscount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: null,
    isActive: true,
    categoryIds: [],
    productIds: [],
    ...overrides,
  };
}

const lines: DiscountLine[] = [
  { productId: "prod_shirt", categoryId: "cat_shirts", lineTotal: 80_000_00 },
  { productId: "prod_tee", categoryId: "cat_t-shirts", lineTotal: 40_000_00 },
];

const evaluate = (coupon: CouponRule | null, context: Partial<{ lines: DiscountLine[]; customerUses: number; now: Date }> = {}) =>
  evaluateCoupon(coupon, "WELCOME10", { now, lines, customerUses: 0, ...context });

describe("evaluateCoupon", () => {
  it("takes a percentage of the bag", () => {
    const result = evaluate(rule());
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.discount, 12_000_00);
  });

  it("caps a percentage at the maximum discount", () => {
    const result = evaluate(rule({ maxDiscount: 5_000_00 }));
    assert.equal(result.ok && result.discount, 5_000_00);
  });

  it("never gives more than the qualifying lines are worth", () => {
    const result = evaluate(rule({ type: "fixed", value: 500_000_00 }));
    assert.equal(result.ok && result.discount, 120_000_00);
  });

  it("rounds down to whole naira", () => {
    const result = evaluate(rule({ value: 7 }), { lines: [{ productId: "p", categoryId: "c", lineTotal: 12_345_67 }] });
    // 7% of ₦12,345.67 is ₦864.19…, shown and charged as ₦864.
    assert.equal(result.ok && result.discount, 864_00);
  });

  it("applies only to restricted categories or products", () => {
    const byCategory = evaluate(rule({ categoryIds: ["cat_t-shirts"] }));
    assert.equal(byCategory.ok && byCategory.discount, 4_000_00);
    const byProduct = evaluate(rule({ productIds: ["prod_shirt"] }));
    assert.equal(byProduct.ok && byProduct.discount, 8_000_00);
  });

  it("refuses a restricted code when nothing in the bag qualifies", () => {
    const result = evaluate(rule({ categoryIds: ["cat_denim"] }));
    assert.equal(!result.ok && result.reason, "not_applicable");
  });

  it("answers unknown and switched-off codes identically", () => {
    const unknown = evaluate(null);
    const inactive = evaluate(rule({ isActive: false }));
    assert.equal(!unknown.ok && unknown.message, !inactive.ok && inactive.message);
  });

  it("respects the start and end dates", () => {
    const early = evaluate(rule({ startsAt: new Date("2026-10-01T00:00:00Z") }));
    assert.equal(!early.ok && early.reason, "not_started");
    const late = evaluate(rule({ endsAt: new Date("2026-09-14T12:00:00Z") }));
    assert.equal(!late.ok && late.reason, "expired");
  });

  it("stops at the usage limit and the per-customer limit", () => {
    const exhausted = evaluate(rule({ usageLimit: 100, usageCount: 100 }));
    assert.equal(!exhausted.ok && exhausted.reason, "exhausted");
    const reused = evaluate(rule({ perCustomerLimit: 1 }), { customerUses: 1 });
    assert.equal(!reused.ok && reused.reason, "customer_limit");
  });

  it("names the minimum spend when the bag is below it", () => {
    const result = evaluate(rule({ minSubtotal: 150_000_00 }));
    assert.equal(!result.ok && result.reason, "min_subtotal");
    assert.match(!result.ok ? result.message : "", /₦150,000/);
  });
});

describe("normalizeCouponCode", () => {
  it("ignores case and spaces", () => {
    assert.equal(normalizeCouponCode(" welcome 10 "), "WELCOME10");
  });
});
