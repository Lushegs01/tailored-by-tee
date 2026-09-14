import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCartQuote, type ResolvedVariant } from "./quote";
import type { Product, ProductVariant } from "./types";

const image = { src: "https://example.com/tee.jpg", width: 800, height: 1000, alt: "Tee", color: "#eee" };

function variant(id: string, colorId: string, onHand: number, reserved = 0, isActive = true): ProductVariant {
  return {
    id,
    sku: id.toUpperCase(),
    colorId,
    sizeId: "m",
    priceOverride: null,
    inventory: { onHand, reserved, lowStockThreshold: 3 },
    isActive,
  };
}

const variants = {
  plenty: variant("var_plenty", "ink", 20),
  low: variant("var_low", "chalk", 3, 1),
  soldOut: variant("var_sold", "sand", 0),
  inactive: variant("var_off", "olive", 10, 0, false),
};

const product: Product = {
  id: "prod_tee",
  slug: "tee",
  name: "Test Tee",
  summary: "",
  description: "",
  details: [],
  material: "",
  care: [],
  fit: null,
  modelNote: null,
  price: 25_000_00,
  compareAtPrice: null,
  categoryId: "cat_t-shirts",
  collectionIds: [],
  tags: [],
  badge: null,
  status: "active",
  isFeatured: false,
  bestsellerRank: null,
  colorIds: ["ink", "chalk", "sand", "olive"],
  sizeIds: ["m"],
  images: [],
  variants: Object.values(variants),
  seo: { title: null, description: null },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function resolve(variantId: string): ResolvedVariant | null {
  const found = product.variants.find((item) => item.id === variantId);
  if (!found) return null;
  return {
    product,
    variant: found,
    color: { id: found.colorId, slug: found.colorId, name: found.colorId, hex: "#000000" },
    size: { id: "m", label: "M", system: "apparel", sortOrder: 1 },
    image,
  };
}

const config = { maxQuantityPerLine: 10, freeDeliveryThreshold: 150_000_00 };
const quote = (lines: unknown) => buildCartQuote(lines, resolve, config);

describe("buildCartQuote", () => {
  it("prices from the catalogue, ignoring anything the browser says a line costs", () => {
    const result = quote([{ variantId: "var_plenty", quantity: 2, price: 1, unitPrice: 1 }]);
    assert.equal(result.lines[0].unitPrice, 25_000_00);
    assert.equal(result.subtotal, 50_000_00);
    assert.equal(result.itemCount, 2);
    assert.equal(result.amountToFreeDelivery, 100_000_00);
  });

  it("merges duplicate lines for the same variant", () => {
    const result = quote([
      { variantId: "var_plenty", quantity: 1 },
      { variantId: "var_plenty", quantity: 2 },
    ]);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].quantity, 3);
  });

  it("reduces a line to what is available (on hand minus reserved), and says so", () => {
    const result = quote([{ variantId: "var_low", quantity: 5 }]);
    assert.equal(result.lines[0].quantity, 2);
    assert.equal(result.issues[0].kind, "quantity_reduced");
  });

  it("caps a line at the per-order limit", () => {
    const result = quote([{ variantId: "var_plenty", quantity: 25 }]);
    assert.equal(result.lines[0].quantity, 10);
    assert.equal(result.issues[0].kind, "quantity_reduced");
  });

  it("removes sold-out, inactive and unknown variants with a reason", () => {
    const result = quote([
      { variantId: "var_sold", quantity: 1 },
      { variantId: "var_off", quantity: 1 },
      { variantId: "var_ghost", quantity: 1 },
    ]);
    assert.equal(result.lines.length, 0);
    assert.deepEqual(
      result.issues.map((issue) => issue.kind),
      ["unavailable", "unavailable", "not_found"],
    );
    assert.equal(result.subtotal, 0);
  });

  it("drops zero, negative and malformed quantities", () => {
    const result = quote([
      { variantId: "var_plenty", quantity: 0 },
      { variantId: "var_plenty", quantity: -3 },
      { variantId: "var_plenty", quantity: 1.5 },
      "nonsense",
    ]);
    assert.equal(result.lines.length, 0);
  });

  it("treats a non-array body as an empty bag", () => {
    assert.equal(quote({ lines: "all of them" }).lines.length, 0);
  });
});
