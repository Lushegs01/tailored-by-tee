import "server-only";

import { unstable_cache } from "next/cache";

import { siteConfig } from "@/config/site";
import type { Media } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import type { MediaAsset } from "@/lib/media/types";

import { fromDbEnum } from "../db-enums";
import type {
  Category,
  Collection,
  InventoryLevel,
  Product,
  ProductBadge,
  ProductImageRole,
  ProductStatus,
  SizeSystem,
} from "../types";

import type { CatalogSnapshot } from "./types";

/*
 * The catalogue from PostgreSQL, mapped to domain records.
 *
 * Content (products, images, collections…) is cached under the `catalog` tag and
 * refreshed every few minutes or immediately via revalidateTag("catalog") when an
 * admin edits something. Stock that decides what a customer can buy is never read
 * from this cache: see `getLiveInventory`.
 */

export const CATALOG_CACHE_TAG = "catalog";
const CATALOG_REVALIDATE_SECONDS = 300;

function toMediaAsset(media: Media): MediaAsset {
  const asset: MediaAsset = {
    src: media.url,
    width: media.width,
    height: media.height,
    alt: media.alt,
    color: media.color,
  };
  if (media.blurDataUrl) asset.blurDataURL = media.blurDataUrl;
  if (media.creditName && media.creditUrl) asset.credit = { name: media.creditName, url: media.creditUrl };
  return asset;
}

async function fetchCatalog(): Promise<CatalogSnapshot> {
  const db = getDb();

  const [categories, collections, products, colors, sizes] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { image: true } }),
    db.collection.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: "asc" },
      include: { heroImage: true, images: { orderBy: { position: "asc" }, include: { media: true } } },
    }),
    db.product.findMany({
      include: {
        colors: { orderBy: { position: "asc" }, select: { colorId: true } },
        sizes: { orderBy: { position: "asc" }, select: { sizeId: true } },
        collections: { orderBy: { position: "asc" }, select: { collectionId: true } },
        images: { orderBy: { position: "asc" }, include: { media: true } },
        variants: { orderBy: { sku: "asc" }, include: { inventory: true } },
      },
    }),
    db.color.findMany({ orderBy: { sortOrder: "asc" } }),
    db.size.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const lowStockThreshold = siteConfig.commerce.defaultLowStockThreshold;

  return {
    version: new Date().toISOString(),
    categories: categories.map(
      (category): Category => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        image: category.image ? toMediaAsset(category.image) : null,
        sortOrder: category.sortOrder,
      }),
    ),
    collections: collections.map(
      (collection): Collection => ({
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        code: collection.code,
        season: collection.season,
        summary: collection.summary,
        description: collection.description,
        heroImage: collection.heroImage ? toMediaAsset(collection.heroImage) : null,
        images: collection.images.map((image) => toMediaAsset(image.media)),
        sortOrder: collection.sortOrder,
        isFeatured: collection.isFeatured,
      }),
    ),
    products: products.map(
      (product): Product => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        summary: product.summary,
        description: product.description,
        details: product.details,
        material: product.material,
        care: product.care,
        fit: product.fit,
        modelNote: product.modelNote,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        categoryId: product.categoryId,
        collectionIds: product.collections.map((link) => link.collectionId),
        tags: product.tags,
        badge: product.badge ? fromDbEnum<ProductBadge>(product.badge) : null,
        status: fromDbEnum<ProductStatus>(product.status),
        isFeatured: product.isFeatured,
        bestsellerRank: product.bestsellerRank,
        colorIds: product.colors.map((link) => link.colorId),
        sizeIds: product.sizes.map((link) => link.sizeId),
        images: product.images.map((image) => ({
          ...toMediaAsset(image.media),
          id: image.id,
          role: fromDbEnum<ProductImageRole>(image.role),
          colorId: image.colorId,
          position: image.position,
        })),
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          colorId: variant.colorId,
          sizeId: variant.sizeId,
          priceOverride: variant.priceOverride,
          isActive: variant.isActive,
          inventory: {
            onHand: variant.inventory?.onHand ?? 0,
            reserved: variant.inventory?.reserved ?? 0,
            lowStockThreshold: variant.inventory?.lowStockThreshold ?? lowStockThreshold,
          },
        })),
        seo: { title: product.seoTitle, description: product.seoDescription },
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      }),
    ),
    colors: colors.map((color) => ({ id: color.id, slug: color.id, name: color.name, hex: color.hex })),
    sizes: sizes.map((size) => ({
      id: size.id,
      label: size.label,
      system: fromDbEnum<SizeSystem>(size.system),
      sortOrder: size.sortOrder,
    })),
  };
}

export const loadDatabaseCatalog = unstable_cache(fetchCatalog, ["catalog-snapshot"], {
  tags: [CATALOG_CACHE_TAG],
  revalidate: CATALOG_REVALIDATE_SECONDS,
});

/**
 * Current stock for specific variants, straight from the database (never cached).
 * Variants without an inventory row come back as out of stock.
 */
export async function getLiveInventory(variantIds: readonly string[]): Promise<Map<string, InventoryLevel>> {
  const ids = [...new Set(variantIds)];
  const levels = new Map<string, InventoryLevel>();
  if (ids.length === 0) return levels;

  const rows = await getDb().inventory.findMany({
    where: { variantId: { in: ids } },
    select: { variantId: true, onHand: true, reserved: true, lowStockThreshold: true },
  });
  const lowStockThreshold = siteConfig.commerce.defaultLowStockThreshold;
  for (const id of ids) levels.set(id, { onHand: 0, reserved: 0, lowStockThreshold });
  for (const row of rows) {
    levels.set(row.variantId, { onHand: row.onHand, reserved: row.reserved, lowStockThreshold: row.lowStockThreshold });
  }
  return levels;
}
