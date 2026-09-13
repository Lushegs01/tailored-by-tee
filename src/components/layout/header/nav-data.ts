import type { CategorySummary, Collection } from "@/lib/catalog/types";
import type { MediaAsset } from "@/lib/media/types";

import type { HeaderNavData, NavCategory, NavCollection } from "./types";

/*
 * Maps catalogue records to the lean shapes in ./types. Pure and type-only on the
 * catalogue side, so it runs in the server header without pulling data code into
 * any client bundle.
 */

type Orientation = "portrait" | "landscape";

function matches(image: MediaAsset, orientation: Orientation) {
  return orientation === "portrait" ? image.height > image.width : image.width >= image.height;
}

/**
 * Picks the collection photograph that survives the frame it is shown in: small
 * 4:5 cards want a portrait, the Shop panel's editorial card wants the wide hero.
 */
function pickImage(collection: Collection, orientation: Orientation): MediaAsset | null {
  const candidates = [collection.heroImage, ...collection.images].filter(
    (image): image is MediaAsset => image !== null,
  );
  return candidates.find((image) => matches(image, orientation)) ?? candidates[0] ?? null;
}

function toNavCollection(collection: Collection, orientation: Orientation): NavCollection {
  return {
    slug: collection.slug,
    name: collection.name,
    href: `/collections/${collection.slug}`,
    code: collection.code,
    season: collection.season,
    summary: collection.summary,
    image: pickImage(collection, orientation),
  };
}

export function buildHeaderNav(
  categories: readonly CategorySummary[],
  collections: readonly Collection[],
): HeaderNavData {
  // Empty categories would be dead ends, so they stay out of the navigation.
  const navCategories: NavCategory[] = categories
    .filter((category) => category.productCount > 0)
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      href: `/shop/${category.slug}`,
      productCount: category.productCount,
    }));

  const featured = collections.find((collection) => collection.isFeatured) ?? collections[0] ?? null;

  return {
    categories: navCategories,
    collections: collections.map((collection) => toNavCollection(collection, "portrait")),
    featured: featured ? toNavCollection(featured, "landscape") : null,
  };
}
