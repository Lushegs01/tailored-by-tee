import "server-only";

import {
  getBestsellers,
  getCategorySummaries,
  getNewArrivals,
  getProductsBySlugs,
  listProducts,
} from "@/lib/catalog/repository";
import type { ProductCardData } from "@/lib/catalog/types";
import type { ProductSource } from "@/lib/content/types";
import { getMedia, type MediaAsset, type MediaKey } from "@/lib/media";

/*
 * Data resolution for homepage blocks. Content references media and catalogue
 * data by key; anything missing resolves to null/empty so the section (or just
 * its image) can be skipped instead of breaking the page.
 */

/** Development-only notice for content that points at something that doesn't exist. */
export function warnMissing(message: string) {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[home] ${message}`);
  }
}

export function resolveMedia(key: MediaKey | undefined, context: string): MediaAsset | null {
  if (!key) return null;
  const asset = getMedia(key);
  if (!asset) warnMissing(`${context}: media "${key}" not found`);
  return asset;
}

export async function resolveShelfProducts(
  source: ProductSource,
  limit: number,
): Promise<ProductCardData[]> {
  const products = await (async () => {
    switch (source.kind) {
      case "newArrivals":
        return getNewArrivals(limit);
      case "bestsellers":
        return getBestsellers(limit);
      case "collection":
        return (await listProducts({ collection: source.slug, pageSize: limit })).items;
      case "category":
        return (await listProducts({ category: source.slug, pageSize: limit })).items;
      case "handpicked":
        return getProductsBySlugs(source.slugs);
    }
  })();

  return products.slice(0, limit);
}

export interface CategoryIndexEntry {
  slug: string;
  name: string;
  href: string;
  count: number;
  image: MediaAsset | null;
}

/** Categories in the editor's order, skipping unknown slugs and empty categories. */
export async function resolveCategoryIndex(slugs: string[]): Promise<CategoryIndexEntry[]> {
  const summaries = await getCategorySummaries();
  const bySlug = new Map(summaries.map((category) => [category.slug, category]));

  return slugs.flatMap((slug) => {
    const category = bySlug.get(slug);
    if (!category) {
      warnMissing(`categoryIndex: category "${slug}" not found`);
      return [];
    }
    if (category.productCount === 0) return [];

    return [
      {
        slug,
        name: category.name,
        href: `/shop/${slug}`,
        count: category.productCount,
        image: category.image ?? getMedia(`category:${slug}`),
      },
    ];
  });
}
