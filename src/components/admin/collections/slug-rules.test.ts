import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SLUG_MAX,
  slugify,
  slugProblem,
  storefrontPath,
  storefrontPrefix,
  suggestFreeSlug,
} from "./slug-rules";

describe("slugify", () => {
  it("lower-cases and joins words with hyphens", () => {
    assert.equal(slugify("Harmattan 2026"), "harmattan-2026");
    assert.equal(slugify("  Studio   Essentials  "), "studio-essentials");
  });

  it("drops accents and curly apostrophes without leaving a hyphen", () => {
    assert.equal(slugify("Café Crème"), "cafe-creme");
    assert.equal(slugify("Harmattan ’26"), "harmattan-26");
    assert.equal(slugify("Tee's Picks"), "tees-picks");
  });

  it("spells out an ampersand", () => {
    assert.equal(slugify("Clay & Tobacco"), "clay-and-tobacco");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    assert.equal(slugify("— Harmattan // 26 —"), "harmattan-26");
    assert.equal(slugify("a---b"), "a-b");
  });

  it("returns an empty slug when there is nothing usable", () => {
    assert.equal(slugify(""), "");
    assert.equal(slugify("   "), "");
    assert.equal(slugify("—/—"), "");
  });

  it("cuts long names at a word boundary, within the limit", () => {
    const slug = slugify("harmattan twenty twenty six capsule in clay and tobacco and dry grass and dust");
    assert.ok(slug.length <= SLUG_MAX, `${slug.length} <= ${SLUG_MAX}`);
    assert.ok(!slug.endsWith("-"));
    assert.ok(slug.startsWith("harmattan-twenty-twenty-six"));
  });

  it("still cuts a single very long word", () => {
    const slug = slugify("x".repeat(SLUG_MAX + 40));
    assert.equal(slug.length, SLUG_MAX);
  });

  it("is stable: slugifying a slug changes nothing", () => {
    for (const input of ["Harmattan ’26 — Clay & Tobacco", "Shirts", "T-Shirts", "a---b"]) {
      const once = slugify(input);
      assert.equal(slugify(once), once, input);
    }
  });
});

describe("slugProblem", () => {
  it("accepts a clean slug", () => {
    assert.equal(slugProblem("harmattan-26", "collection"), null);
    assert.equal(slugProblem("shirts", "category"), null);
  });

  it("asks for something when empty", () => {
    assert.match(slugProblem("", "collection") ?? "", /Enter a web address/);
  });

  it("refuses characters that survived a paste", () => {
    assert.match(slugProblem("Harmattan 26", "collection") ?? "", /lower-case letters/);
    assert.match(slugProblem("-harmattan", "collection") ?? "", /lower-case letters/);
    assert.match(slugProblem("harmattan-", "collection") ?? "", /lower-case letters/);
  });

  it("refuses a slug over the limit", () => {
    assert.match(slugProblem("a".repeat(SLUG_MAX + 1), "collection") ?? "", /80 characters or fewer/);
  });

  it("keeps categories off the shop's own listing pages", () => {
    assert.match(slugProblem("new-arrivals", "category") ?? "", /New Arrivals/);
    assert.match(slugProblem("sale", "category") ?? "", /Sale/);
  });

  it("allows those words as collections, which live elsewhere", () => {
    assert.equal(slugProblem("sale", "collection"), null);
    assert.equal(slugProblem("new-arrivals", "collection"), null);
  });
});

describe("storefrontPath and storefrontPrefix", () => {
  it("uses the shop's real addresses", () => {
    assert.equal(storefrontPath("collection", "harmattan-26"), "/collections/harmattan-26");
    assert.equal(storefrontPath("category", "shirts"), "/shop/shirts");
    assert.equal(storefrontPrefix("collection"), "/collections/");
    assert.equal(storefrontPrefix("category"), "/shop/");
  });
});

describe("suggestFreeSlug", () => {
  it("keeps the slug when it is free", () => {
    assert.equal(suggestFreeSlug("shirts", []), "shirts");
    assert.equal(suggestFreeSlug("shirts", ["trousers"]), "shirts");
  });

  it("counts up past the ones taken", () => {
    assert.equal(suggestFreeSlug("shirts", ["shirts"]), "shirts-2");
    assert.equal(suggestFreeSlug("shirts", ["shirts", "shirts-2", "shirts-3"]), "shirts-4");
  });

  it("stays within the length limit for a long base", () => {
    const base = "a".repeat(SLUG_MAX);
    const suggestion = suggestFreeSlug(base, [base]);
    assert.ok(suggestion.length <= SLUG_MAX, `${suggestion.length} <= ${SLUG_MAX}`);
    assert.notEqual(suggestion, base);
    assert.ok(suggestion.endsWith("-2"));
  });
});
