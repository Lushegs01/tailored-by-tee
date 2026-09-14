import "server-only";

import { siteConfig } from "@/config/site";
import { getMedia, getProductMedia } from "@/lib/media";

import { buildProduct, categoryId, collectionId } from "../mappers";
import { CATEGORY_SEEDS } from "../seed/categories";
import { COLLECTION_SEEDS } from "../seed/collections";
import { COLORS } from "../seed/colors";
import { PRODUCT_SEEDS } from "../seed/products";
import { SIZES } from "../seed/sizes";
import type { Category, Collection } from "../types";

import type { CatalogSnapshot } from "./types";

/*
 * The typed demo catalogue, expanded into domain records: variants, SKUs,
 * deterministic stock and placeholder photography. Used when no database is
 * configured, and by `prisma/seed.ts` to fill one.
 */

let snapshot: CatalogSnapshot | null = null;

export function loadSeedCatalog(): CatalogSnapshot {
  snapshot ??= buildSeedCatalog();
  return snapshot;
}

function buildSeedCatalog(): CatalogSnapshot {
  const categories: Category[] = CATEGORY_SEEDS.map((seed, index) => ({
    id: categoryId(seed.slug),
    slug: seed.slug,
    name: seed.name,
    description: seed.description,
    image: getMedia(`category:${seed.slug}`),
    sortOrder: index,
  }));

  const collections: Collection[] = COLLECTION_SEEDS.map((seed, index) => ({
    id: collectionId(seed.slug),
    slug: seed.slug,
    name: seed.name,
    code: seed.code,
    season: seed.season,
    summary: seed.summary,
    description: seed.description,
    heroImage: seed.heroImageKey ? getMedia(seed.heroImageKey) : null,
    images: seed.imageKeys.flatMap((key) => getMedia(key) ?? []),
    sortOrder: index,
    isFeatured: seed.isFeatured,
  }));

  const categoryCodes = new Map<string, string>(CATEGORY_SEEDS.map((seed) => [seed.slug, seed.code]));
  const products = PRODUCT_SEEDS.map((seed) =>
    buildProduct(seed, {
      categoryCode: categoryCodes.get(seed.category) ?? "GEN",
      media: getProductMedia(seed.slug),
      lowStockThreshold: siteConfig.commerce.defaultLowStockThreshold,
    }),
  );

  return { version: "seed", categories, collections, products, colors: [...COLORS], sizes: [...SIZES] };
}
