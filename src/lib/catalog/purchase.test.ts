import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPurchaseOptions, findVariant, initialColorId, initialSizeId, isSoldOut, sizeStates } from "./purchase";
import type { ProductDetail, ProductVariant } from "./types";

function variant(colorId: string, sizeId: string, onHand: number, reserved = 0): ProductVariant {
  return {
    id: `var_${colorId}_${sizeId}`,
    sku: `${colorId}-${sizeId}`,
    colorId,
    sizeId,
    priceOverride: null,
    inventory: { onHand, reserved, lowStockThreshold: 3 },
    isActive: true,
  };
}

function detail(variants: ProductVariant[], sizeIds = ["s", "m", "l"]): ProductDetail {
  return {
    id: "prod_polo",
    slug: "polo",
    name: "Polo",
    summary: "",
    description: "",
    details: [],
    material: "",
    care: [],
    fit: null,
    modelNote: null,
    price: 60_000_00,
    compareAtPrice: null,
    categoryId: "cat_knitwear",
    collectionIds: [],
    tags: [],
    badge: null,
    status: "active",
    isFeatured: false,
    bestsellerRank: null,
    colorIds: ["sage", "sand"],
    sizeIds,
    images: [
      { src: "x", width: 1, height: 1, alt: "", color: "#000", id: "i", role: "primary", colorId: "sage", position: 0 },
    ],
    variants,
    seo: { title: null, description: null },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    category: { id: "cat_knitwear", slug: "knitwear", name: "Knitwear", description: "", image: null, sortOrder: 0 },
    collections: [],
    colors: [
      { id: "sage", slug: "sage", name: "Sage", hex: "#9CA38E" },
      { id: "sand", slug: "sand", name: "Sand", hex: "#C9B592" },
    ],
    sizes: sizeIds.map((id, index) => ({ id, label: id.toUpperCase(), system: "apparel" as const, sortOrder: index })),
  };
}

describe("buildPurchaseOptions", () => {
  // Sage (the photographed colour) is sold out; Sand has S (low), M (plenty), L (none).
  const options = buildPurchaseOptions(
    detail([
      variant("sage", "s", 0),
      variant("sage", "m", 0),
      variant("sage", "l", 0),
      variant("sand", "s", 3, 1),
      variant("sand", "m", 40),
      variant("sand", "l", 0),
    ]),
    10,
  );

  it("marks colours with nothing to buy", () => {
    assert.deepEqual(
      options.colors.map((color) => [color.id, color.available]),
      [
        ["sage", false],
        ["sand", true],
      ],
    );
  });

  it("opens on the first colour that can be bought, and remembers which was photographed", () => {
    assert.equal(initialColorId(options), "sand");
    assert.equal(options.photographedColorId, "sage");
  });

  it("disables sizes that are sold out in the chosen colour", () => {
    assert.deepEqual(
      sizeStates(options, "sand").map((size) => [size.id, size.available]),
      [
        ["s", true],
        ["m", true],
        ["l", false],
      ],
    );
  });

  it("caps quantity at the per-order limit and at what's available", () => {
    assert.equal(findVariant(options, "sand", "m")?.maxQuantity, 10);
    assert.equal(findVariant(options, "sand", "s")?.maxQuantity, 2);
  });

  it("only shares a stock number when stock is genuinely low", () => {
    assert.equal(findVariant(options, "sand", "s")?.lowStockRemaining, 2);
    assert.equal(findVariant(options, "sand", "m")?.lowStockRemaining, null);
  });

  it("knows a piece is sold out only when no colour has stock", () => {
    assert.equal(isSoldOut(options), false);
    assert.equal(isSoldOut(buildPurchaseOptions(detail([variant("sand", "m", 0)]), 10)), true);
  });

  it("preselects the only size of a one-size piece", () => {
    const oneSize = buildPurchaseOptions(detail([variant("sand", "os", 5)], ["os"]), 10);
    assert.equal(initialSizeId(oneSize), "os");
    assert.equal(initialSizeId(options), null);
  });
});
