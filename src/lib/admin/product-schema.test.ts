import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRODUCT_SEEDS } from "@/lib/catalog/seed/products";

import { parseInput } from "./validation";
import {
  BULK_ACTION_STATUS,
  MAX_BULK_PRODUCTS,
  MAX_TAGS,
  PRODUCT_BADGE_OPTIONS,
  PRODUCT_CODE_LENGTH,
  PRODUCT_FIELD_LIMITS,
  PRODUCT_LIST_ALLOWED,
  SEO_DESCRIPTION_RECOMMENDED,
  SEO_TITLE_RECOMMENDED,
  bulkProductSchema,
  canPublish,
  counterState,
  createProductSchema,
  exampleProductSku,
  formatTags,
  normaliseProductCode,
  parseTags,
  productBadgeLabel,
  productBasicsSchema,
  productCodeProblem,
  productOrganisationSchema,
  productPath,
  productPreviewPath,
  productPricingSchema,
  productSeoSchema,
  productStatusSchema,
  productStockState,
  publishBlockedMessage,
  publishBlockers,
  publishChecklist,
  seoDescriptionFallback,
  seoTitleFallback,
  suggestProductCode,
  type PublishFacts,
} from "./product-schema";

/* ── Codes ──────────────────────────────────────────────────────────────── */

describe("normaliseProductCode", () => {
  it("keeps three capital letters", () => {
    assert.equal(normaliseProductCode("kpl"), "KPL");
    assert.equal(normaliseProductCode(" k-p l 9 "), "KPL");
    assert.equal(normaliseProductCode("KNITTED"), "KNI");
    assert.equal(normaliseProductCode(""), "");
  });
});

describe("productCodeProblem", () => {
  it("accepts every seeded product code", () => {
    for (const seed of PRODUCT_SEEDS) {
      assert.equal(productCodeProblem(seed.code), null, seed.code);
      assert.equal(seed.code.length, PRODUCT_CODE_LENGTH, seed.code);
    }
  });

  it("asks for a code when there is none", () => {
    assert.match(productCodeProblem("") ?? "", /Enter a three-letter code/);
  });

  it("refuses anything that isn't exactly three letters", () => {
    assert.match(productCodeProblem("KP") ?? "", /exactly three letters/);
    assert.match(productCodeProblem("K1L") ?? "", /exactly three letters/);
  });
});

describe("suggestProductCode", () => {
  it("makes a code from the name", () => {
    assert.equal(suggestProductCode("Knitted Polo", []), "KPL");
    assert.equal(suggestProductCode("Linen Camp Shirt", []), "LCS");
    assert.equal(suggestProductCode("Overshirt", []), "OVR");
  });

  it("never suggests one already in use", () => {
    const first = suggestProductCode("Knitted Polo", []);
    assert.ok(first);
    const second = suggestProductCode("Knitted Polo", [first]);
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(productCodeProblem(second), null);
  });

  it("finds a free code even when the obvious ones are taken", () => {
    const taken = new Set<string>();
    for (const second of "ABCDEFGHIJ") for (const third of "ABCDEFGHIJ") taken.add(`K${second}${third}`);
    const code = suggestProductCode("Knitted Polo", taken);
    assert.ok(code);
    assert.equal(productCodeProblem(code), null);
    assert.ok(!taken.has(code));
  });

  it("gives nothing back when the name has no letters", () => {
    assert.equal(suggestProductCode("2026 —", []), null);
  });

  it("gives every seeded product a free code from its name", () => {
    const taken = new Set<string>();
    for (const seed of PRODUCT_SEEDS) {
      const code = suggestProductCode(seed.name, taken);
      assert.ok(code, seed.name);
      assert.equal(productCodeProblem(code), null, `${seed.name} → ${code}`);
      assert.ok(!taken.has(code), `${code} is free`);
      taken.add(code);
    }
  });
});

describe("exampleProductSku", () => {
  it("shows the shop's own SKU shape", () => {
    assert.equal(exampleProductSku("KNT", "KPL"), "TBT-KNT-KPL-SND-M");
    assert.equal(exampleProductSku("", ""), "TBT-…-…-SND-M");
  });
});

/* ── Tags ───────────────────────────────────────────────────────────────── */

describe("parseTags", () => {
  it("splits, trims and drops empties", () => {
    assert.deepEqual(parseTags(" linen , summer ,, "), ["linen", "summer"]);
  });

  it("drops repeats whatever their case", () => {
    assert.deepEqual(parseTags("Linen, linen, LINEN"), ["Linen"]);
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: MAX_TAGS + 5 }, (_, index) => `tag${index}`).join(", ");
    assert.equal(parseTags(many).length, MAX_TAGS);
  });

  it("cuts a tag that is too long", () => {
    const [tag] = parseTags("x".repeat(PRODUCT_FIELD_LIMITS.tag + 10));
    assert.equal(tag.length, PRODUCT_FIELD_LIMITS.tag);
  });

  it("round-trips through formatTags", () => {
    assert.deepEqual(parseTags(formatTags(["linen", "summer"])), ["linen", "summer"]);
  });
});

/* ── Badges and counters ────────────────────────────────────────────────── */

describe("badges", () => {
  it("names each one in plain words", () => {
    assert.equal(productBadgeLabel("ONLINE_EXCLUSIVE"), "Online exclusive");
    assert.equal(productBadgeLabel(null), null);
    assert.equal(PRODUCT_BADGE_OPTIONS.length, 4);
  });
});

describe("counterState", () => {
  it("reads fine well under the recommendation", () => {
    assert.equal(counterState(10, SEO_TITLE_RECOMMENDED), "ok");
  });

  it("warns as it approaches, and again once past", () => {
    assert.equal(counterState(SEO_TITLE_RECOMMENDED - 2, SEO_TITLE_RECOMMENDED), "near");
    assert.equal(counterState(SEO_TITLE_RECOMMENDED, SEO_TITLE_RECOMMENDED), "near");
    assert.equal(counterState(SEO_TITLE_RECOMMENDED + 1, SEO_TITLE_RECOMMENDED), "over");
    assert.equal(counterState(SEO_DESCRIPTION_RECOMMENDED + 1, SEO_DESCRIPTION_RECOMMENDED), "over");
  });
});

describe("SEO fallbacks", () => {
  it("matches what the product page uses when nothing is set", () => {
    assert.equal(seoTitleFallback("Linen Shirt", "Shirts"), "Linen Shirt — Shirts");
    assert.equal(seoTitleFallback("Linen Shirt", ""), "Linen Shirt");
    assert.equal(seoDescriptionFallback("One line about it."), "One line about it.");
  });
});

/* ── Publish checklist ──────────────────────────────────────────────────── */

const ready: PublishFacts = {
  price: 45_000_00,
  imageCount: 3,
  hasPrimaryImage: true,
  variantCount: 6,
  activeVariantCount: 6,
  availableToSell: 12,
  hasCopy: true,
};

describe("publishChecklist", () => {
  it("passes a product that has everything", () => {
    assert.ok(canPublish(ready));
    assert.deepEqual(publishBlockers(ready), []);
    assert.equal(publishChecklist(ready).every((item) => item.done), true);
    assert.equal(publishBlockedMessage("Linen Shirt", ready), "");
  });

  it("blocks a product with no price", () => {
    const facts = { ...ready, price: 0 };
    assert.equal(canPublish(facts), false);
    assert.equal(publishBlockers(facts).length, 1);
    assert.match(publishBlockedMessage("Linen Shirt", facts), /Linen Shirt/);
  });

  it("blocks a product with no main photo, and says which case it is", () => {
    const none = { ...ready, hasPrimaryImage: false, imageCount: 0 };
    assert.equal(canPublish(none), false);
    assert.match(publishChecklist(none).find((item) => item.key === "image")?.detail ?? "", /Add a photo/);

    const unset = { ...ready, hasPrimaryImage: false, imageCount: 4 };
    assert.match(publishChecklist(unset).find((item) => item.key === "image")?.detail ?? "", /none is set as the main/);
  });

  it("blocks a product with no switched-on variant, and says which case it is", () => {
    const none = { ...ready, variantCount: 0, activeVariantCount: 0 };
    assert.match(publishChecklist(none).find((item) => item.key === "variants")?.detail ?? "", /Add colours and sizes/);

    const off = { ...ready, variantCount: 6, activeVariantCount: 0 };
    assert.match(publishChecklist(off).find((item) => item.key === "variants")?.detail ?? "", /switched off/);
    assert.equal(canPublish(off), false);
  });

  it("lets a sold-out product be published, but says so", () => {
    const soldOut = { ...ready, availableToSell: 0 };
    assert.ok(canPublish(soldOut));
    const stock = publishChecklist(soldOut).find((item) => item.key === "stock");
    assert.equal(stock?.done, false);
    assert.equal(stock?.required, false);
  });

  it("lets a product with no words written be published, but says so", () => {
    const noCopy = { ...ready, hasCopy: false };
    assert.ok(canPublish(noCopy));
    const copy = publishChecklist(noCopy).find((item) => item.key === "copy");
    assert.equal(copy?.done, false);
    assert.equal(copy?.required, false);
    assert.match(copy?.detail ?? "", /still empty/);
  });

  it("names every missing required item at once", () => {
    const empty: PublishFacts = {
      price: 0,
      imageCount: 0,
      hasPrimaryImage: false,
      variantCount: 0,
      activeVariantCount: 0,
      availableToSell: 0,
      hasCopy: false,
    };
    assert.equal(publishBlockers(empty).length, 3);
  });
});

describe("productStockState", () => {
  it("is sold out when nothing can be sold", () => {
    assert.equal(productStockState({ available: 0, threshold: 9 }), "out_of_stock");
    assert.equal(productStockState({ available: 0, threshold: 0 }), "out_of_stock");
  });

  it("is low once what's left has fallen to the low-stock levels", () => {
    assert.equal(productStockState({ available: 9, threshold: 9 }), "low_stock");
    assert.equal(productStockState({ available: 1, threshold: 9 }), "low_stock");
  });

  it("is in stock above them", () => {
    assert.equal(productStockState({ available: 10, threshold: 9 }), "in_stock");
    assert.equal(productStockState({ available: 1, threshold: 0 }), "in_stock");
  });
});

/* ── Paths and the list URL ─────────────────────────────────────────────── */

describe("paths", () => {
  it("escapes the id", () => {
    assert.equal(productPath("prod_linen shirt"), "/admin/products/prod_linen%20shirt");
    assert.equal(productPreviewPath("abc"), "/admin/products/abc/preview");
  });
});

describe("PRODUCT_LIST_ALLOWED", () => {
  it("allows only the filters and sorts the page understands", () => {
    assert.deepEqual([...PRODUCT_LIST_ALLOWED.filters], ["status", "category", "collection", "stock"]);
    assert.equal(PRODUCT_LIST_ALLOWED.defaultSort, "updated");
    assert.equal(PRODUCT_LIST_ALLOWED.defaultDir, "desc");
    assert.deepEqual([...(PRODUCT_LIST_ALLOWED.filterValues?.stock ?? [])], [
      "in_stock",
      "low_stock",
      "out_of_stock",
    ]);
  });
});

/* ── Schemas ────────────────────────────────────────────────────────────── */

describe("createProductSchema", () => {
  it("reads a filled form", () => {
    const parsed = parseInput(createProductSchema, {
      name: "  Linen Camp Shirt ",
      categoryId: "cat_shirts",
      price: "₦45,000",
      code: "lcs",
    });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.name, "Linen Camp Shirt");
    assert.equal(parsed.data.price, 45_000_00);
    assert.equal(parsed.data.code, "lcs");
  });

  it("names each empty field", () => {
    const parsed = parseInput(createProductSchema, { name: "", categoryId: "", price: "", code: "" });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.name);
    assert.ok(parsed.fieldErrors.categoryId);
    assert.ok(parsed.fieldErrors.price);
    assert.ok(parsed.fieldErrors.code);
  });

  it("refuses a free price", () => {
    const parsed = parseInput(createProductSchema, { name: "A", categoryId: "c", price: "0", code: "ABC" });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.price);
  });
});

const basics = {
  id: "prod_1",
  expectedUpdatedAt: "2026-09-14T10:00:00.000Z",
  name: "Linen Camp Shirt",
  slug: "linen-camp-shirt",
  code: "LCS",
  summary: "A soft, easy shirt.",
  description: "The long read.",
  material: "100% linen",
};

describe("productBasicsSchema", () => {
  it("reads repeated detail and care lines, dropping the empties", () => {
    const parsed = parseInput(productBasicsSchema, {
      ...basics,
      details: ["Camp collar", "  ", "Boxy fit"],
      care: ["Cold wash"],
      fit: "",
      modelNote: "  ",
    });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.details, ["Camp collar", "Boxy fit"]);
    assert.deepEqual(parsed.data.care, ["Cold wash"]);
    assert.equal(parsed.data.fit, null);
    assert.equal(parsed.data.modelNote, null);
    assert.equal(parsed.data.confirmSlugChange, false);
  });

  it("reads one detail sent on its own", () => {
    const parsed = parseInput(productBasicsSchema, { ...basics, details: "Camp collar" });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.details, ["Camp collar"]);
  });

  it("requires the fields the shop shows", () => {
    const parsed = parseInput(productBasicsSchema, { ...basics, name: "", summary: "", description: "", material: "" });
    assert.ok(!parsed.ok);
    for (const field of ["name", "summary", "description", "material"]) assert.ok(parsed.fieldErrors[field], field);
  });

  it("refuses a summary past its limit", () => {
    const parsed = parseInput(productBasicsSchema, { ...basics, summary: "x".repeat(PRODUCT_FIELD_LIMITS.summary + 1) });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.summary);
  });

  it("refuses a save with no concurrency token", () => {
    const parsed = parseInput(productBasicsSchema, { ...basics, expectedUpdatedAt: "" });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.expectedUpdatedAt);
  });

  it("reads the confirmation tick", () => {
    const parsed = parseInput(productBasicsSchema, { ...basics, confirmSlugChange: "on" });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.confirmSlugChange, true);
  });
});

describe("productOrganisationSchema", () => {
  it("reads several collections, tags and the best-seller position", () => {
    const parsed = parseInput(productOrganisationSchema, {
      id: "prod_1",
      expectedUpdatedAt: basics.expectedUpdatedAt,
      categoryId: "cat_shirts",
      collectionIds: ["col_a", "col_b"],
      tags: "linen, summer",
      badge: "NEW",
      isFeatured: "on",
      bestsellerRank: "3",
    });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.collectionIds, ["col_a", "col_b"]);
    assert.equal(parsed.data.isFeatured, true);
    assert.equal(parsed.data.bestsellerRank, 3);
  });

  it("treats no collections at all as an empty list", () => {
    const parsed = parseInput(productOrganisationSchema, {
      id: "prod_1",
      expectedUpdatedAt: basics.expectedUpdatedAt,
      categoryId: "cat_shirts",
    });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.collectionIds, []);
    assert.equal(parsed.data.bestsellerRank, null);
    assert.equal(parsed.data.isFeatured, false);
  });

  it("refuses a best-seller position of zero", () => {
    const parsed = parseInput(productOrganisationSchema, {
      id: "prod_1",
      expectedUpdatedAt: basics.expectedUpdatedAt,
      categoryId: "cat_shirts",
      bestsellerRank: "0",
    });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.bestsellerRank);
  });
});

describe("productPricingSchema", () => {
  it("accepts an original price above the price", () => {
    const parsed = parseInput(productPricingSchema, {
      id: "prod_1",
      expectedUpdatedAt: basics.expectedUpdatedAt,
      price: "45,000",
      compareAtPrice: "60,000",
    });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.price, 45_000_00);
    assert.equal(parsed.data.compareAtPrice, 60_000_00);
  });

  it("accepts an empty original price", () => {
    const parsed = parseInput(productPricingSchema, {
      id: "prod_1",
      expectedUpdatedAt: basics.expectedUpdatedAt,
      price: "45,000",
      compareAtPrice: "",
    });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.compareAtPrice, null);
  });

  it("refuses an original price at or below the price", () => {
    for (const compareAtPrice of ["45,000", "30,000"]) {
      const parsed = parseInput(productPricingSchema, {
        id: "prod_1",
        expectedUpdatedAt: basics.expectedUpdatedAt,
        price: "45,000",
        compareAtPrice,
      });
      assert.ok(!parsed.ok, compareAtPrice);
      assert.ok(parsed.fieldErrors.compareAtPrice, compareAtPrice);
    }
  });
});

describe("productSeoSchema", () => {
  it("turns empty fields into nothing set", () => {
    const parsed = parseInput(productSeoSchema, {
      id: "prod_1",
      expectedUpdatedAt: basics.expectedUpdatedAt,
      seoTitle: "  ",
      seoDescription: "",
    });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.seoTitle, null);
    assert.equal(parsed.data.seoDescription, null);
  });
});

describe("productStatusSchema", () => {
  it("carries the status the owner was looking at", () => {
    const parsed = parseInput(productStatusSchema, { id: "p", expectedStatus: "DRAFT", status: "ACTIVE" });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.expectedStatus, "DRAFT");
    assert.equal(parsed.data.status, "ACTIVE");
  });

  it("refuses a status the shop doesn't have", () => {
    const parsed = parseInput(productStatusSchema, { id: "p", expectedStatus: "DRAFT", status: "LIVE" });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.status);
  });
});

describe("bulkProductSchema", () => {
  it("reads one step over several products, without repeats", () => {
    const parsed = parseInput(bulkProductSchema, { action: "archive", ids: ["a", "b", "a"] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.ids, ["a", "b"]);
    assert.equal(BULK_ACTION_STATUS[parsed.data.action], "ARCHIVED");
  });

  it("refuses an empty selection", () => {
    const parsed = parseInput(bulkProductSchema, { action: "publish", ids: [] });
    assert.ok(!parsed.ok);
    assert.ok(parsed.fieldErrors.ids);
  });

  it("refuses more than the limit", () => {
    const ids = Array.from({ length: MAX_BULK_PRODUCTS + 1 }, (_, index) => `id${index}`);
    const parsed = parseInput(bulkProductSchema, { action: "publish", ids });
    assert.ok(!parsed.ok);
  });

  it("refuses a step it doesn't know", () => {
    const parsed = parseInput(bulkProductSchema, { action: "delete", ids: ["a"] });
    assert.ok(!parsed.ok);
  });
});
