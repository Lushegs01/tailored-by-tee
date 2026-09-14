import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DeliveryPolicy } from "@/config/policies";

import { quoteDelivery } from "./delivery";

/** A fixed policy, so these tests check the rules rather than the (placeholder) fees in config. */
const policy: DeliveryPolicy = {
  isPlaceholder: false,
  zones: [
    { id: "lagos", name: "Lagos", states: ["LA"], fee: 3_000_00, freeOver: 100_000_00, estimate: "1–2 days" },
    { id: "south-west", name: "South West", states: ["OG", "OY"], fee: 5_000_00, freeOver: null, estimate: "2–4 days" },
    { id: "nationwide", name: "Rest of Nigeria", states: null, fee: 8_000_00, freeOver: null, estimate: "3–6 days" },
  ],
  pickup: { enabled: true, name: "Collect from the studio", estimate: "Next working day", address: "Studio" },
  dispatch: "",
  notes: [],
};

describe("quoteDelivery", () => {
  it("charges the zone fee below the free threshold, and says how far off it is", () => {
    const quote = quoteDelivery({ method: "delivery", stateCode: "LA", subtotal: 60_000_00 }, policy);
    assert.equal(quote?.fee, 3_000_00);
    assert.equal(quote?.isFree, false);
    assert.equal(quote?.amountToFree, 40_000_00);
  });

  it("is free at and above the threshold", () => {
    for (const subtotal of [100_000_00, 250_000_00]) {
      const quote = quoteDelivery({ method: "delivery", stateCode: "LA", subtotal }, policy);
      assert.equal(quote?.fee, 0);
      assert.equal(quote?.isFree, true);
      assert.equal(quote?.amountToFree, null);
    }
  });

  it("finds a named zone, case-insensitively", () => {
    const quote = quoteDelivery({ method: "delivery", stateCode: "og", subtotal: 1_000_00 }, policy);
    assert.equal(quote?.zoneId, "south-west");
    assert.equal(quote?.fee, 5_000_00);
    assert.equal(quote?.amountToFree, null);
  });

  it("sends states no zone names to the catch-all zone", () => {
    const quote = quoteDelivery({ method: "delivery", stateCode: "KN", subtotal: 500_000_00 }, policy);
    assert.equal(quote?.zoneId, "nationwide");
    assert.equal(quote?.fee, 8_000_00);
  });

  it("can't quote delivery before a state is chosen", () => {
    assert.equal(quoteDelivery({ method: "delivery", stateCode: null, subtotal: 1 }, policy), null);
    assert.equal(quoteDelivery({ method: "delivery", stateCode: "", subtotal: 1 }, policy), null);
  });

  it("makes collection free, and unavailable when pickup is switched off", () => {
    const pickup = quoteDelivery({ method: "pickup", stateCode: null, subtotal: 1 }, policy);
    assert.equal(pickup?.fee, 0);
    assert.equal(pickup?.zoneId, null);
    assert.equal(quoteDelivery({ method: "pickup", stateCode: null, subtotal: 1 }, { ...policy, pickup: null }), null);
  });
});
