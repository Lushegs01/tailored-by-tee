import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRODUCT_SEEDS } from "@/lib/catalog/seed/products";

import {
  PRODUCT_SLUG_MAX,
  PRODUCT_SLUG_PREFIX,
  nextFreeProductSlug,
  productSlugProblem,
  productStorefrontPath,
  slugify,
  suggestProductSlug,
} from "./slug";

describe("slugify (products)", () => {
  it("makes the shop's own address from a name", () => {
    assert.equal(slugify("Linen Camp Shirt"), "linen-camp-shirt");
    assert.equal(slugify("Harmattan ’26 — Clay & Tobacco"), "harmattan-26-clay-and-tobacco");
    assert.equal(slugify("  Écru   Overshirt  "), "ecru-overshirt");
  });

  it("gives nothing back for a name with no letters or numbers", () => {
    assert.equal(slugify("—  —"), "");
  });

  it("never goes past the limit and never ends in a hyphen", () => {
    const slug = slugify("A".repeat(40) + " " + "B".repeat(60));
    assert.ok(slug.length <= PRODUCT_SLUG_MAX, `${slug.length} <= ${PRODUCT_SLUG_MAX}`);
    assert.doesNotMatch(slug, /-$/);
  });

  it("reproduces every seeded product address from its name or keeps it valid", () => {
    for (const seed of PRODUCT_SEEDS) {
      assert.equal(productSlugProblem(seed.slug), null, `${seed.slug} is a usable address`);
      assert.equal(slugify(seed.slug), seed.slug, `${seed.slug} is already tidy`);
    }
  });
});

describe("productSlugProblem", () => {
  it("accepts an ordinary address", () => {
    assert.equal(productSlugProblem("linen-camp-shirt"), null);
    assert.equal(productSlugProblem("collection-04"), null);
  });

  it("refuses an empty one", () => {
    assert.match(productSlugProblem("") ?? "", /Enter a web address/);
  });

  it("refuses capitals, spaces and stray hyphens", () => {
    for (const bad of ["Linen-Shirt", "linen shirt", "-linen", "linen-", "linen--shirt", "linen_shirt"]) {
      assert.match(productSlugProblem(bad) ?? "", /lower-case letters/, bad);
    }
  });

  it("refuses one that is too long", () => {
    const problem = productSlugProblem("a".repeat(PRODUCT_SLUG_MAX + 1));
    assert.match(problem ?? "", new RegExp(String(PRODUCT_SLUG_MAX)));
  });
});

describe("nextFreeProductSlug", () => {
  it("keeps the address when nothing has taken it", () => {
    assert.equal(nextFreeProductSlug("linen-shirt", ["other"]), "linen-shirt");
  });

  it("counts up past the ones in use", () => {
    assert.equal(nextFreeProductSlug("linen-shirt", ["linen-shirt"]), "linen-shirt-2");
    assert.equal(nextFreeProductSlug("linen-shirt", ["linen-shirt", "linen-shirt-2"]), "linen-shirt-3");
  });

  it("stays within the limit when the base is already as long as it may be", () => {
    const base = "a".repeat(PRODUCT_SLUG_MAX);
    const next = nextFreeProductSlug(base, [base]);
    assert.ok(next.length <= PRODUCT_SLUG_MAX, `${next.length} <= ${PRODUCT_SLUG_MAX}`);
    assert.notEqual(next, base);
  });
});

describe("suggestProductSlug", () => {
  it("makes a free address from the name", () => {
    assert.equal(suggestProductSlug("Linen Camp Shirt", []), "linen-camp-shirt");
    assert.equal(suggestProductSlug("Linen Camp Shirt", ["linen-camp-shirt"]), "linen-camp-shirt-2");
  });

  it("gives nothing back when the name has nothing to work with", () => {
    assert.equal(suggestProductSlug("!!!", []), "");
  });
});

describe("productStorefrontPath", () => {
  it("is the shop's product address", () => {
    assert.equal(productStorefrontPath("linen-camp-shirt"), "/product/linen-camp-shirt");
    assert.equal(PRODUCT_SLUG_PREFIX, "/product/");
  });
});
