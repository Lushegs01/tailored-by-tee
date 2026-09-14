import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatOrderNumber, orderYear } from "./order-number";

describe("order numbers", () => {
  it("pads the sequence to six digits", () => {
    assert.equal(formatOrderNumber(2026, 1284), "ORD-2026-001284");
    assert.equal(formatOrderNumber(2026, 1), "ORD-2026-000001");
  });

  it("keeps growing past six digits rather than wrapping", () => {
    assert.equal(formatOrderNumber(2026, 1_234_567), "ORD-2026-1234567");
  });

  it("uses the Lagos calendar year", () => {
    // 23:30 UTC on 31 December is already 00:30 on 1 January in Lagos.
    assert.equal(orderYear(new Date("2026-12-31T23:30:00Z")), 2027);
    assert.equal(orderYear(new Date("2026-12-31T22:30:00Z")), 2026);
  });
});
