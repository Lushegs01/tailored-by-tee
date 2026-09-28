import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SiteConfig } from "@/config/site";
import type { HomeBlock, ProductSource } from "@/lib/content/types";

import {
  describeReferencePlaces,
  findShopReferences,
  hrefPointsAt,
  NOT_FOUND_CATEGORY_LINKS,
  type ShopReference,
} from "./shop-references";

/*
 * The warnings shown before a web address changes or a collection is deleted.
 * Most tests use made-up content so they don't move with the real shop; the last
 * group checks the live configuration is still being read, without pinning it.
 */

type SiteSources = Pick<SiteConfig, "mainNav" | "footer" | "announcement">;

const SITE: SiteSources = {
  mainNav: [
    { label: "Shop", href: "/shop" },
    { label: "Shirts", href: "/shop/shirts" },
  ],
  footer: {
    columns: [{ title: "Shop", links: [{ label: "Harmattan", href: "/collections/harmattan-26" }] }],
    legal: [{ label: "Privacy", href: "/privacy" }],
  },
  announcement: { message: "Now in", href: "/collections/harmattan-26", linkLabel: "See the collection" },
};

const EMPTY_SITE: SiteSources = {
  mainNav: [],
  footer: { columns: [], legal: [] },
  announcement: null,
};

function find(kind: "collection" | "category", slug: string, blocks: HomeBlock[] = [], site = EMPTY_SITE) {
  return findShopReferences(kind, slug, { blocks, site, notFoundLinks: [] });
}

describe("hrefPointsAt", () => {
  it("matches a collection's own page", () => {
    assert.equal(hrefPointsAt("/collections/harmattan-26", "collection", "harmattan-26"), true);
    assert.equal(hrefPointsAt("/collections/harmattan-26/", "collection", "harmattan-26"), true);
    assert.equal(hrefPointsAt("/collections/harmattan-26?x=1", "collection", "harmattan-26"), true);
  });

  it("matches a category's own page", () => {
    assert.equal(hrefPointsAt("/shop/shirts", "category", "shirts"), true);
    assert.equal(hrefPointsAt("/shop/shirts/", "category", "shirts"), true);
  });

  it("does not confuse one slug for another, or one kind for the other", () => {
    assert.equal(hrefPointsAt("/collections/harmattan-26", "collection", "harmattan"), false);
    assert.equal(hrefPointsAt("/collections/harmattan-26-b", "collection", "harmattan-26"), false);
    assert.equal(hrefPointsAt("/shop/shirts", "collection", "shirts"), false);
    assert.equal(hrefPointsAt("/collections/shirts", "category", "shirts"), false);
    assert.equal(hrefPointsAt("/shop", "category", "shirts"), false);
  });

  it("matches a shop listing filtered to the collection", () => {
    assert.equal(hrefPointsAt("/shop?collection=harmattan-26", "collection", "harmattan-26"), true);
    assert.equal(hrefPointsAt("/shop/shirts?collection=harmattan-26", "collection", "harmattan-26"), true);
    assert.equal(hrefPointsAt("/shop?collection=other", "collection", "harmattan-26"), false);
  });

  it("ignores links that leave the shop, and anything unparseable", () => {
    assert.equal(hrefPointsAt("https://example.com/shop/shirts", "category", "shirts"), false);
    assert.equal(hrefPointsAt("//example.com/shop/shirts", "category", "shirts"), false);
    assert.equal(hrefPointsAt("", "category", "shirts"), false);
  });
});

describe("findShopReferences", () => {
  it("finds nothing for an empty slug or an unreferenced one", () => {
    assert.deepEqual(findShopReferences("collection", "", { blocks: [], site: EMPTY_SITE }), []);
    assert.deepEqual(find("collection", "nothing-points-here"), []);
  });

  it("finds a homepage collection feature", () => {
    const blocks: HomeBlock[] = [
      {
        type: "collectionSpread",
        collectionSlug: "harmattan-26",
        eyebrow: "Collection 04",
        title: "Harmattan",
        body: "…",
        cta: { label: "Explore", href: "/collections/harmattan-26" },
        images: ["editorial:collectionMain", "editorial:collectionSecondaryA", "editorial:collectionSecondaryB"],
        theme: "ink",
      },
    ];
    const references = find("collection", "harmattan-26", blocks);
    assert.equal(references.length, 2, JSON.stringify(references));
    assert.deepEqual(
      references.map((reference) => reference.effect),
      ["feature", "link"],
    );
    assert.equal(references[0].place, "Homepage — “Harmattan” collection feature");
    assert.equal(references[1].item, "“Explore” link");
  });

  it("finds a homepage category list", () => {
    const blocks: HomeBlock[] = [
      { type: "categoryIndex", eyebrow: "Categories", title: "Shop the *wardrobe.*", categories: ["shirts"] },
    ];
    const references = find("category", "shirts", blocks);
    assert.deepEqual(references, [
      { place: "Homepage — “Shop the wardrobe.” category list", item: "Lists this category", effect: "feature" },
    ]);
    assert.deepEqual(find("category", "trousers", blocks), []);
  });

  it("finds a product shelf drawing from the collection or category", () => {
    const shelf = (source: ProductSource): HomeBlock => ({
      type: "productShelf",
      id: "shelf",
      title: "Most worn",
      source,
      limit: 8,
      layout: "grid",
    });
    assert.deepEqual(find("collection", "harmattan-26", [shelf({ kind: "collection", slug: "harmattan-26" })]), [
      { place: "Homepage — “Most worn” shelf", item: "Shows pieces from this collection", effect: "feature" },
    ]);
    assert.deepEqual(find("category", "shirts", [shelf({ kind: "category", slug: "shirts" })]), [
      { place: "Homepage — “Most worn” shelf", item: "Shows pieces from this category", effect: "feature" },
    ]);
    // Same slug, other kind: not a reference.
    assert.deepEqual(find("category", "harmattan-26", [shelf({ kind: "collection", slug: "harmattan-26" })]), []);
    assert.deepEqual(find("collection", "shirts", [shelf({ kind: "newArrivals" })]), []);
  });

  it("finds links nested anywhere in a block", () => {
    const blocks: HomeBlock[] = [
      {
        type: "hero",
        eyebrow: "Collection 04",
        headline: "Made *well.*",
        body: "…",
        primaryCta: { label: "Explore the collection", href: "/collections/harmattan-26" },
        image: "editorial:hero",
        caption: { label: "Look 01", href: "/product/cropped-twill-jacket" },
      },
      {
        type: "splitStory",
        eyebrow: "Essentials",
        title: "The *first* reach",
        body: "…",
        image: "editorial:essentials",
        imageSide: "left",
        items: [{ label: "The overshirt", href: "/collections/harmattan-26" }],
      },
    ];
    const references = find("collection", "harmattan-26", blocks);
    assert.equal(references.length, 2);
    assert.equal(references[0].place, "Homepage — opening photograph");
    assert.equal(references[1].place, "Homepage — “The first reach” feature");
    assert.ok(references.every((reference) => reference.effect === "link"));
  });

  it("finds links in the menu, footer, announcement bar and the not-found page", () => {
    const references = findShopReferences("collection", "harmattan-26", {
      blocks: [],
      site: SITE,
      notFoundLinks: [{ label: "Harmattan", href: "/collections/harmattan-26" }],
    });
    assert.deepEqual(
      references.map((reference) => reference.place),
      ["Footer — “Shop” column", "Announcement bar", "“Page not found” page"],
    );

    const categoryReferences = findShopReferences("category", "shirts", {
      blocks: [],
      site: SITE,
      notFoundLinks: NOT_FOUND_CATEGORY_LINKS,
    });
    assert.deepEqual(
      categoryReferences.map((reference) => reference.place),
      ["Main menu", "“Page not found” page"],
    );
  });
});

describe("describeReferencePlaces", () => {
  const reference = (place: string): ShopReference => ({ place, item: "x", effect: "link" });

  it("says nothing when there is nothing", () => {
    assert.equal(describeReferencePlaces([]), "");
  });

  it("groups the homepage and the footer, and keeps other places apart", () => {
    assert.equal(
      describeReferencePlaces([
        reference("Homepage — opening photograph"),
        reference("Homepage — “Most worn” shelf"),
      ]),
      "the homepage",
    );
    assert.equal(
      describeReferencePlaces([
        reference("Homepage — opening photograph"),
        reference("Footer — “Shop” column"),
        reference("Main menu"),
      ]),
      "the homepage, the footer and the main menu",
    );
    assert.equal(
      describeReferencePlaces([reference("Main menu"), reference("“Page not found” page")]),
      "the main menu and the “page not found” page",
    );
  });
});

describe("against the live shop configuration", () => {
  it("reads the real homepage and site config by default", () => {
    // The seeded homepage features this collection; if it stops doing so, this
    // test should be updated with it.
    const references = findShopReferences("collection", "harmattan-26");
    assert.ok(references.length > 0, "expected the homepage to reference harmattan-26");
    assert.ok(references.some((reference) => reference.effect === "feature"));
    assert.ok(references.some((reference) => reference.place.startsWith("Homepage")));
  });

  it("finds the seeded categories the shop links to", () => {
    for (const slug of ["shirts", "trousers", "outerwear", "knitwear"]) {
      assert.ok(findShopReferences("category", slug).length > 0, slug);
    }
  });

  it("finds nothing for a slug the shop has never heard of", () => {
    assert.deepEqual(findShopReferences("category", "made-up-slug"), []);
    assert.deepEqual(findShopReferences("collection", "made-up-slug"), []);
  });
});
