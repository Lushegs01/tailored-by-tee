import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PRODUCT_SIZES,
  buildVariantMatrix,
  canRemoveOption,
  colorIdFromName,
  comboKey,
  insertSizeInOrder,
  joinWords,
  moveInList,
  normaliseHex,
  openingStockField,
  optionRemovalAdvice,
  optionRemovalProblem,
  optionUsage,
  ordinal,
  parseComboKey,
  productSizeSystem,
  sizeAddProblem,
  sizeIdFor,
  slugify,
  summariseVariants,
  variantDeleteBlock,
  variantDeleteBlockedMessage,
  type OptionSize,
  type ProductColorView,
  type VariantView,
} from "./variant-rules";

const sand: ProductColorView = { id: "sand", name: "Sand", hex: "#C9B592", code: "SND", photos: 0 };
const ink: ProductColorView = { id: "ink", name: "Ink", hex: "#1C1C1E", code: "INK", photos: 2 };

function size(id: string, label: string, sortOrder: number, system: OptionSize["system"] = "APPAREL", code = label): OptionSize {
  return { id, label, system, code, sortOrder };
}

const s = size("s", "S", 2);
const m = size("m", "M", 3);
const l = size("l", "L", 4);
const w32 = size("w32", "32", 9, "WAIST");
const oneSize = size("one-size", "One Size", 18, "ONE_SIZE", "OS");

function variant(overrides: Partial<VariantView> & Pick<VariantView, "colorId" | "sizeId">): VariantView {
  return {
    id: `var_${overrides.colorId}_${overrides.sizeId}`,
    sku: `TBT-KNT-KPL-${overrides.colorId.toUpperCase()}-${overrides.sizeId.toUpperCase()}`,
    colorName: overrides.colorId,
    colorHex: "#000000",
    sizeLabel: overrides.sizeId.toUpperCase(),
    isActive: true,
    priceOverride: null,
    onHand: 0,
    reserved: 0,
    lowStockThreshold: 3,
    orderLines: 0,
    awaitingShipment: 0,
    ...overrides,
  };
}

const product = { code: "KPL", categoryCode: "KNT" };

describe("buildVariantMatrix", () => {
  it("lays out colours × sizes, with missing combinations and their SKUs", () => {
    const matrix = buildVariantMatrix({
      product,
      colors: [sand, ink],
      sizes: [s, m],
      variants: [variant({ colorId: "sand", sizeId: "s", sku: "TBT-KNT-KPL-SND-S" })],
    });
    assert.equal(matrix.groups.length, 2);
    assert.deepEqual(
      matrix.groups.map((group) => [group.color.id, group.created]),
      [
        ["sand", 1],
        ["ink", 0],
      ],
    );
    assert.equal(matrix.groups[0].cells[0].variant?.sku, "TBT-KNT-KPL-SND-S");
    assert.deepEqual(
      matrix.missing.map((cell) => cell.sku),
      ["TBT-KNT-KPL-SND-M", "TBT-KNT-KPL-INK-S", "TBT-KNT-KPL-INK-M"],
    );
    assert.deepEqual(matrix.orphans, []);
    assert.deepEqual(matrix.skuProblems, []);
  });

  it("keeps variants of colours or sizes no longer offered apart", () => {
    const orphan = variant({ colorId: "olive", sizeId: "m", sku: "TBT-KNT-KPL-OLV-M" });
    const oldSize = variant({ colorId: "sand", sizeId: "xl", sku: "TBT-KNT-KPL-SND-XL" });
    const matrix = buildVariantMatrix({
      product,
      colors: [sand],
      sizes: [m],
      variants: [orphan, oldSize, variant({ colorId: "sand", sizeId: "m" })],
    });
    assert.deepEqual(
      matrix.orphans.map((item) => item.sku),
      ["TBT-KNT-KPL-OLV-M", "TBT-KNT-KPL-SND-XL"],
    );
    assert.equal(matrix.missing.length, 0);
  });

  it("explains codes that stop SKUs being made, and gives no SKU for those cells", () => {
    const matrix = buildVariantMatrix({
      product: { code: "K-P", categoryCode: "KNT" },
      colors: [sand],
      sizes: [m],
      variants: [],
    });
    assert.equal(matrix.missing[0].sku, null);
    assert.equal(matrix.skuProblems.length, 1);
    assert.match(matrix.skuProblems[0], /product code “K-P”/);

    const badColour = buildVariantMatrix({
      product,
      colors: [sand, { ...ink, code: "" }],
      sizes: [m],
      variants: [],
    });
    assert.deepEqual(
      badColour.missing.map((cell) => cell.sku),
      ["TBT-KNT-KPL-SND-M", null],
    );
    assert.match(badColour.skuProblems[0], /^Ink: The colour code is missing/);
  });
});

describe("removal rules", () => {
  it("allows removing a colour or size only when nothing was ordered and nothing is in stock", () => {
    assert.equal(canRemoveOption(optionUsage([])), true);
    assert.equal(canRemoveOption(optionUsage([variant({ colorId: "sand", sizeId: "m" })])), true);
    assert.equal(canRemoveOption(optionUsage([variant({ colorId: "sand", sizeId: "m", orderLines: 1 })])), false);
    assert.equal(canRemoveOption(optionUsage([variant({ colorId: "sand", sizeId: "m", onHand: 2 })])), false);
  });

  it("counts what stands in the way", () => {
    const usage = optionUsage([
      variant({ colorId: "sand", sizeId: "s", orderLines: 3, onHand: 2, reserved: 1 }),
      variant({ colorId: "sand", sizeId: "m", isActive: false }),
      variant({ colorId: "sand", sizeId: "l", onHand: 4 }),
    ]);
    assert.deepEqual(usage, { variants: 3, active: 2, ordered: 1, stocked: 2, onHand: 6, reserved: 1 });
  });

  it("says why in the owner's words", () => {
    assert.equal(optionRemovalProblem("Sand", optionUsage([])), null);
    assert.equal(
      optionRemovalProblem(
        "Sand",
        optionUsage([
          variant({ colorId: "sand", sizeId: "s", orderLines: 1 }),
          variant({ colorId: "sand", sizeId: "m", onHand: 3, reserved: 1 }),
        ]),
      ),
      "Sand can’t be removed: 1 of its variants has been ordered and 3 pieces are in stock (1 held for unpaid orders).",
    );
    assert.equal(
      optionRemovalProblem("M", optionUsage([variant({ colorId: "sand", sizeId: "m", orderLines: 2 })])),
      "M can’t be removed: its variant has been ordered.",
    );
    assert.equal(
      optionRemovalProblem(
        "Ink",
        optionUsage([
          variant({ colorId: "ink", sizeId: "s", orderLines: 1 }),
          variant({ colorId: "ink", sizeId: "m", orderLines: 1 }),
        ]),
      ),
      "Ink can’t be removed: all 2 of its variants have been ordered.",
    );
  });

  it("offers switching off, or says it's already off", () => {
    const ordered = optionUsage([variant({ colorId: "sand", sizeId: "s", orderLines: 1 })]);
    assert.match(optionRemovalAdvice("colour", "Sand", ordered), /switch its variants off/);
    const off = optionUsage([variant({ colorId: "sand", sizeId: "s", orderLines: 1, isActive: false })]);
    assert.match(optionRemovalAdvice("colour", "Sand", off), /already switched off/);
  });

  it("deletes a variant only when it was never ordered and has no stock", () => {
    assert.equal(variantDeleteBlock(variant({ colorId: "sand", sizeId: "m" })), null);
    assert.equal(variantDeleteBlock(variant({ colorId: "sand", sizeId: "m", orderLines: 1, onHand: 3 })), "ordered");
    assert.equal(variantDeleteBlock(variant({ colorId: "sand", sizeId: "m", onHand: 1 })), "stock");
    assert.equal(variantDeleteBlock(variant({ colorId: "sand", sizeId: "m", onHand: 1, reserved: 1 })), "stock");
  });

  it("explains a refused delete", () => {
    const ordered = variant({ colorId: "sand", sizeId: "m", orderLines: 1, sku: "TBT-KNT-KPL-SND-M" });
    assert.match(variantDeleteBlockedMessage(ordered), /^TBT-KNT-KPL-SND-M has been ordered/);
    assert.match(variantDeleteBlockedMessage(ordered), /switch it off instead/);
    const stocked = variant({ colorId: "sand", sizeId: "m", onHand: 3, reserved: 2, sku: "X", isActive: false });
    assert.match(variantDeleteBlockedMessage(stocked), /3 pieces on hand, 2 of them held for unpaid orders/);
    assert.match(variantDeleteBlockedMessage(stocked), /already switched off/);
    assert.equal(variantDeleteBlockedMessage(variant({ colorId: "sand", sizeId: "m" })), "");
  });
});

describe("sizes", () => {
  it("keeps a product's sizes to one system", () => {
    assert.equal(productSizeSystem([]), null);
    assert.equal(productSizeSystem([m, l]), "APPAREL");
    assert.equal(sizeAddProblem([m], l), null);
    assert.equal(sizeAddProblem([], w32), null);
    assert.match(sizeAddProblem([m], w32) ?? "", /uses clothing sizes, so 32 \(waist sizes\) can’t be added/);
    assert.match(sizeAddProblem([m], m) ?? "", /already on this product/);
  });

  it("allows one size only for one-size products", () => {
    assert.equal(sizeAddProblem([], oneSize), null);
    assert.match(sizeAddProblem([oneSize], size("os2", "One Size Long", 19, "ONE_SIZE", "OSL")) ?? "", /just one size/);
  });

  it("caps the number of sizes", () => {
    const many = Array.from({ length: MAX_PRODUCT_SIZES }, (_, index) => size(`z${index}`, `Z${index}`, 100 + index));
    assert.match(sizeAddProblem(many, size("new", "NEW", 500)) ?? "", /up to/);
  });

  it("inserts a new size where it falls in the registry's order", () => {
    assert.deepEqual(
      insertSizeInOrder([m, l], s).map((item) => item.id),
      ["s", "m", "l"],
    );
    assert.deepEqual(
      insertSizeInOrder([s, m], l).map((item) => item.id),
      ["s", "m", "l"],
    );
    // The product's own order is kept around it.
    assert.deepEqual(
      insertSizeInOrder([l, s], m).map((item) => item.id),
      ["m", "l", "s"],
    );
  });
});

describe("ids and values", () => {
  it("makes slugs like the seeded ids", () => {
    assert.equal(slugify("Pale Blue"), "pale-blue");
    assert.equal(slugify("  Écru / Natural "), "ecru-natural");
    assert.equal(slugify("!!!"), "");
    assert.equal(colorIdFromName("Washed Black"), "washed-black");
  });

  it("makes size ids like the seeded ones", () => {
    assert.equal(sizeIdFor("APPAREL", "XXXL"), "xxxl");
    assert.equal(sizeIdFor("WAIST", "40"), "w40");
    assert.equal(sizeIdFor("BELT", "105"), "b105");
    assert.equal(sizeIdFor("WAIST", "Long"), "w-long");
    assert.equal(sizeIdFor("ONE_SIZE", "One Size"), "one-size");
    assert.equal(sizeIdFor("APPAREL", "—"), "");
  });

  it("normalises hex colours", () => {
    assert.equal(normaliseHex("#c9b592"), "#C9B592");
    assert.equal(normaliseHex("c9b592"), "#C9B592");
    assert.equal(normaliseHex(" #abc "), "#AABBCC");
    assert.equal(normaliseHex("#c9b59"), null);
    assert.equal(normaliseHex("sand"), null);
  });

  it("round-trips combination keys, and refuses anything else", () => {
    assert.deepEqual(parseComboKey(comboKey("pale-blue", "w32")), { colorId: "pale-blue", sizeId: "w32" });
    assert.equal(parseComboKey("sand"), null);
    assert.equal(parseComboKey("sand|m|l"), null);
    assert.equal(parseComboKey("sand|<m>"), null);
    assert.equal(parseComboKey(42), null);
    assert.equal(openingStockField("sand", "m"), "stock|sand|m");
  });

  it("moves an item one place, and refuses at either end", () => {
    assert.deepEqual(moveInList(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(moveInList(["a", "b", "c"], "b", "down"), ["a", "c", "b"]);
    assert.equal(moveInList(["a", "b", "c"], "a", "up"), null);
    assert.equal(moveInList(["a", "b", "c"], "c", "down"), null);
    assert.equal(moveInList(["a", "b", "c"], "z", "up"), null);
  });

  it("joins words and counts positions", () => {
    assert.equal(joinWords([]), "");
    assert.equal(joinWords(["Sand"]), "Sand");
    assert.equal(joinWords(["Sand", "Ink"]), "Sand and Ink");
    assert.equal(joinWords(["Sand", "Ink", "Olive"]), "Sand, Ink and Olive");
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), [
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "103rd",
    ]);
  });
});

describe("summariseVariants", () => {
  it("counts what's for sale, sold out and low, leaving switched-off variants out of availability", () => {
    const summary = summariseVariants([
      variant({ colorId: "sand", sizeId: "s", onHand: 10, reserved: 1 }),
      variant({ colorId: "sand", sizeId: "m", onHand: 2, reserved: 0 }),
      variant({ colorId: "sand", sizeId: "l", onHand: 1, reserved: 1 }),
      variant({ colorId: "ink", sizeId: "s", onHand: 5, isActive: false }),
    ]);
    assert.deepEqual(summary, {
      total: 4,
      active: 3,
      inactive: 1,
      onHand: 18,
      reserved: 2,
      available: 11,
      soldOut: 1,
      lowStock: 1,
    });
  });
});
