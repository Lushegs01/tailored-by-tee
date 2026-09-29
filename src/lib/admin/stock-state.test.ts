import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildListHref } from "./pagination";
import {
  ADJUST_REASON_OPTIONS,
  INVENTORY_PATH,
  MANUAL_ADJUST_REASONS,
  MAX_STOCK_CHANGE,
  STOCK_STATE_OPTIONS,
  adjustmentSavedMessage,
  containsPattern,
  countBelowReservedMessage,
  countChangedMessage,
  countSavedMessage,
  formatStockDelta,
  historyActorLabel,
  inventoryReasonLabel,
  isAdjustReason,
  isAutomaticReason,
  isLargeStockChange,
  isManualAdjustReason,
  parseInventoryListParams,
  parseWholeNumber,
  pieces,
  previewCount,
  previewStockChange,
  reasonDirection,
  resolveStockChange,
  stockChangeFailureMessage,
  stockState,
  toInventoryListQuery,
  variantLabel,
} from "./stock-state";

const level = (onHand: number, reserved = 0, lowStockThreshold = 3) => ({
  onHand,
  reserved,
  lowStockThreshold,
});

describe("stockState", () => {
  it("follows the storefront rule on what's available to sell", () => {
    assert.equal(stockState(level(0)), "out_of_stock");
    assert.equal(stockState(level(2, 2)), "out_of_stock");
    assert.equal(stockState(level(3)), "low_stock");
    assert.equal(stockState(level(5, 2)), "low_stock");
    assert.equal(stockState(level(4)), "in_stock");
  });

  it("never reports low stock with the warning off (level 0)", () => {
    assert.equal(stockState(level(1, 0, 0)), "in_stock");
    assert.equal(stockState(level(0, 0, 0)), "out_of_stock");
  });

  it("names every state in the shared admin vocabulary", () => {
    assert.deepEqual(
      STOCK_STATE_OPTIONS.map((option) => [option.value, option.label]),
      [
        ["out_of_stock", "Sold out"],
        ["low_stock", "Low stock"],
        ["in_stock", "In stock"],
      ],
    );
  });
});

describe("parseWholeNumber", () => {
  it("reads whole numbers as people type them", () => {
    assert.equal(parseWholeNumber("12"), 12);
    assert.equal(parseWholeNumber(" 7 "), 7);
    assert.equal(parseWholeNumber("1,200"), 1200);
    assert.equal(parseWholeNumber("0"), 0);
  });

  it("rejects anything that isn't a clear whole number", () => {
    for (const text of ["", " ", "-3", "+3", "2.5", "1e3", "12,00", ",100", "12a", "0x10", "١٢"]) {
      assert.equal(parseWholeNumber(text), null, text);
    }
  });
});

describe("reasons", () => {
  it("accepts only the service's reasons", () => {
    for (const reason of ["INITIAL", "RESTOCK", "CORRECTION", "DAMAGE", "ORDER_RETURNED"]) {
      assert.equal(isAdjustReason(reason), true, reason);
    }
    for (const reason of ["ORDER_RESERVED", "ORDER_RELEASED", "ORDER_FULFILLED", "restock", "", null, 3]) {
      assert.equal(isAdjustReason(reason), false, String(reason));
    }
  });

  it("keeps opening stock out of the manual form", () => {
    assert.equal(isManualAdjustReason("INITIAL"), false);
    assert.deepEqual(
      [...ADJUST_REASON_OPTIONS.map((option) => option.value)].sort(),
      [...MANUAL_ADJUST_REASONS].sort(),
    );
  });

  it("knows which way each reason moves stock", () => {
    assert.equal(reasonDirection("RESTOCK"), "add");
    assert.equal(reasonDirection("ORDER_RETURNED"), "add");
    assert.equal(reasonDirection("DAMAGE"), "remove");
    assert.equal(reasonDirection("CORRECTION"), "either");
  });

  it("words every movement for the history", () => {
    assert.equal(inventoryReasonLabel("ORDER_FULFILLED"), "Sold");
    assert.equal(inventoryReasonLabel("ORDER_RESERVED"), "Held for a checkout");
    assert.equal(inventoryReasonLabel("INITIAL"), "Opening stock");
    assert.equal(isAutomaticReason("ORDER_RELEASED"), true);
    assert.equal(isAutomaticReason("DAMAGE"), false);
  });
});

describe("resolveStockChange", () => {
  it("turns a reason and quantity into a signed change", () => {
    assert.deepEqual(resolveStockChange({ reason: "RESTOCK", quantity: 5 }), { ok: true, delta: 5 });
    assert.deepEqual(resolveStockChange({ reason: "ORDER_RETURNED", quantity: 1 }), { ok: true, delta: 1 });
    assert.deepEqual(resolveStockChange({ reason: "DAMAGE", quantity: 2 }), { ok: true, delta: -2 });
    assert.deepEqual(resolveStockChange({ reason: "CORRECTION", direction: "remove", quantity: 3 }), {
      ok: true,
      delta: -3,
    });
    assert.deepEqual(resolveStockChange({ reason: "CORRECTION", direction: "add", quantity: 3 }), {
      ok: true,
      delta: 3,
    });
  });

  it("accepts the implied direction when it's sent anyway", () => {
    assert.deepEqual(resolveStockChange({ reason: "DAMAGE", direction: "remove", quantity: 1 }), {
      ok: true,
      delta: -1,
    });
  });

  it("needs a direction for corrections", () => {
    const result = resolveStockChange({ reason: "CORRECTION", quantity: 3 });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.field, "direction");
  });

  it("refuses a direction that contradicts the reason", () => {
    const restock = resolveStockChange({ reason: "RESTOCK", direction: "remove", quantity: 3 });
    assert.equal(!restock.ok && restock.field, "direction");
    const damage = resolveStockChange({ reason: "DAMAGE", direction: "add", quantity: 3 });
    assert.equal(!damage.ok && damage.field, "direction");
  });

  it("refuses zero, negative, fractional and enormous quantities", () => {
    for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_STOCK_CHANGE + 1]) {
      const result = resolveStockChange({ reason: "RESTOCK", quantity });
      assert.equal(!result.ok && result.field, "quantity", String(quantity));
    }
    assert.deepEqual(resolveStockChange({ reason: "RESTOCK", quantity: MAX_STOCK_CHANGE }), {
      ok: true,
      delta: MAX_STOCK_CHANGE,
    });
  });
});

describe("previewStockChange", () => {
  it("shows the new figures", () => {
    assert.deepEqual(previewStockChange(level(10, 2), 5), {
      ok: true,
      onHand: 15,
      reserved: 2,
      available: 13,
      state: "in_stock",
    });
    assert.deepEqual(previewStockChange(level(10, 2), -8), {
      ok: true,
      onHand: 2,
      reserved: 2,
      available: 0,
      state: "out_of_stock",
    });
  });

  it("never goes below what's held for unpaid orders", () => {
    assert.deepEqual(previewStockChange(level(10, 4), -7), {
      ok: false,
      reason: "below_reserved",
      maxRemovable: 6,
    });
  });

  it("never goes below zero", () => {
    assert.deepEqual(previewStockChange(level(3), -4), { ok: false, reason: "negative", maxRemovable: 3 });
  });
});

describe("isLargeStockChange", () => {
  it("asks twice for 50 pieces or more either way", () => {
    assert.equal(isLargeStockChange(50, 0), true);
    assert.equal(isLargeStockChange(-50, 200), true);
    assert.equal(isLargeStockChange(49, 0), false);
  });

  it("asks twice before taking half of a shelf of 10 or more", () => {
    assert.equal(isLargeStockChange(-5, 10), true);
    assert.equal(isLargeStockChange(-4, 10), false);
    assert.equal(isLargeStockChange(-5, 9), false);
  });

  it("ignores no change and nonsense", () => {
    assert.equal(isLargeStockChange(0, 100), false);
    assert.equal(isLargeStockChange(Number.NaN, 100), false);
  });
});

describe("previewCount", () => {
  it("gives the difference from the record", () => {
    assert.deepEqual(previewCount(level(9, 2), 7), {
      ok: true,
      delta: -2,
      onHand: 7,
      available: 5,
      state: "in_stock",
    });
    assert.deepEqual(previewCount(level(9), 9), {
      ok: true,
      delta: 0,
      onHand: 9,
      available: 9,
      state: "in_stock",
    });
    assert.deepEqual(previewCount(level(0), 3), {
      ok: true,
      delta: 3,
      onHand: 3,
      available: 3,
      state: "low_stock",
    });
  });

  it("can't record fewer than the held pieces", () => {
    assert.deepEqual(previewCount(level(9, 4), 3), { ok: false, reason: "below_reserved", minimum: 4 });
    assert.equal(previewCount(level(9, 4), 4).ok, true);
  });
});

describe("wording", () => {
  it("formats changes with a true minus sign", () => {
    assert.equal(formatStockDelta(5), "+5");
    assert.equal(formatStockDelta(-3), "−3");
    assert.equal(formatStockDelta(0), "0");
    assert.equal(formatStockDelta(1200), "+1,200");
    assert.equal(formatStockDelta(Number.NaN), "—");
  });

  it("counts pieces", () => {
    assert.equal(pieces(1), "1 piece");
    assert.equal(pieces(0), "0 pieces");
    assert.equal(pieces(1500), "1,500 pieces");
  });

  it("explains a refused removal", () => {
    assert.match(
      stockChangeFailureMessage("below_reserved", level(10, 4)),
      /held for unpaid orders.*at most 6/,
    );
    assert.match(stockChangeFailureMessage("negative", level(3)), /Only 3 pieces on hand.*at most 3/);
    assert.match(stockChangeFailureMessage("negative", level(0)), /nothing on hand/);
    assert.match(stockChangeFailureMessage("not_found"), /can’t be found/);
  });

  it("explains a refused count", () => {
    assert.match(
      countChangedMessage(9, 7),
      /^Stock changed while you were counting — review and try again\./,
    );
    assert.match(countChangedMessage(9, 7), /7 pieces on hand \(it said 9/);
    assert.match(countBelowReservedMessage(1), /1 piece is held/);
    assert.match(countBelowReservedMessage(3), /can’t be lower than 3/);
  });

  it("confirms saved changes", () => {
    const label = variantLabel({ productName: "Knitted Polo", colorName: "Sand", sizeLabel: "M" });
    assert.equal(label, "Knitted Polo — Sand, M");
    assert.equal(
      adjustmentSavedMessage({ label, delta: 5, onHand: 12, reserved: 1 }),
      "Added 5 pieces to Knitted Polo — Sand, M. 12 on hand, 11 available to sell.",
    );
    assert.equal(
      adjustmentSavedMessage({ label, delta: -1, onHand: 2, reserved: 2 }),
      "Removed 1 piece from Knitted Polo — Sand, M. 2 on hand, 0 available to sell.",
    );
    assert.match(countSavedMessage({ label, delta: 0, onHand: 9 }), /matching the record/);
    assert.match(countSavedMessage({ label, delta: -2, onHand: 7 }), /7 pieces on hand, 2 pieces fewer/);
  });

  it("names who made a movement", () => {
    assert.equal(historyActorLabel({ actorEmail: "tee@example.com", reason: "RESTOCK" }), "tee@example.com");
    assert.equal(historyActorLabel({ actorEmail: null, reason: "ORDER_FULFILLED" }), "Automatic");
    assert.equal(historyActorLabel({ actorEmail: null, reason: "INITIAL" }), "Not recorded");
  });
});

describe("inventory list parameters", () => {
  const slugs = ["knitwear", "trousers"];

  it("defaults to least available first, hiding archived products and switched-off variants", () => {
    const query = toInventoryListQuery(parseInventoryListParams({}), slugs);
    assert.deepEqual(query, {
      page: 1,
      q: "",
      state: null,
      categorySlug: null,
      productStatus: null,
      includeArchived: false,
      includeInactive: false,
      sort: "available",
      dir: "asc",
    });
  });

  it("reads every filter", () => {
    const query = toInventoryListQuery(
      parseInventoryListParams({
        q: " polo ",
        state: "low_stock",
        category: "knitwear",
        status: "DRAFT",
        inactive: "show",
        sort: "sku",
        dir: "desc",
        page: "3",
      }),
      slugs,
    );
    assert.deepEqual(query, {
      page: 3,
      q: "polo",
      state: "low_stock",
      categorySlug: "knitwear",
      productStatus: "DRAFT",
      includeArchived: false,
      includeInactive: true,
      sort: "sku",
      dir: "desc",
    });
  });

  it("includes archived products only when asked", () => {
    const all = toInventoryListQuery(parseInventoryListParams({ status: "all" }), slugs);
    assert.equal(all.productStatus, null);
    assert.equal(all.includeArchived, true);
    const archived = toInventoryListQuery(parseInventoryListParams({ status: "ARCHIVED" }), slugs);
    assert.equal(archived.productStatus, "ARCHIVED");
    assert.equal(archived.includeArchived, true);
  });

  it("ignores unknown values", () => {
    const query = toInventoryListQuery(
      parseInventoryListParams({
        state: "plenty",
        category: "shoes",
        status: "active",
        inactive: "yes",
        sort: "price",
        dir: "sideways",
      }),
      slugs,
    );
    assert.equal(query.state, null);
    assert.equal(query.categorySlug, null);
    assert.equal(query.productStatus, null);
    assert.equal(query.includeInactive, false);
    assert.equal(query.sort, "available");
    assert.equal(query.dir, "asc");
  });

  it("keeps the default order out of links", () => {
    const params = parseInventoryListParams({ state: "out_of_stock" });
    assert.equal(buildListHref(INVENTORY_PATH, params), "/admin/inventory?state=out_of_stock");
    assert.equal(
      buildListHref(INVENTORY_PATH, params, { sort: "sku", dir: "asc" }),
      "/admin/inventory?state=out_of_stock&sort=sku&dir=asc",
    );
  });
});

describe("containsPattern", () => {
  it("matches anywhere, taking wildcards literally", () => {
    assert.equal(containsPattern("polo"), "%polo%");
    assert.equal(containsPattern("50%_off\\"), "%50\\%\\_off\\\\%");
  });
});
