import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeTotals } from "./totals";

describe("computeTotals", () => {
  it("is subtotal − discount + shipping", () => {
    assert.deepEqual(computeTotals({ subtotal: 120_000_00, discount: 12_000_00, shipping: 3_500_00 }), {
      subtotal: 120_000_00,
      discountTotal: 12_000_00,
      shippingTotal: 3_500_00,
      total: 111_500_00,
    });
  });

  it("never lets a discount exceed the subtotal", () => {
    const totals = computeTotals({ subtotal: 10_000_00, discount: 50_000_00, shipping: 3_500_00 });
    assert.equal(totals.discountTotal, 10_000_00);
    assert.equal(totals.total, 3_500_00);
  });

  it("refuses fractional or negative kobo", () => {
    assert.throws(() => computeTotals({ subtotal: 10.5, discount: 0, shipping: 0 }), RangeError);
    assert.throws(() => computeTotals({ subtotal: 100, discount: -1, shipping: 0 }), RangeError);
  });
});
