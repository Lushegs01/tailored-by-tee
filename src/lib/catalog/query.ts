import { isPurchasable } from "./inventory";
import type { Category, Collection, Kobo, Product, ProductQuery, ProductSort, Size } from "./types";
import { NEW_ARRIVALS_LIMIT, isVirtualCategory } from "./virtual-categories";

/*
 * Listing rules — filtering, sorting and pagination — over an in-memory product
 * list. Pure; Phase 8 expresses the same rules as Prisma queries.
 */

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;

export interface QueryContext {
  categoriesBySlug: ReadonlyMap<string, Category>;
  collectionsBySlug: ReadonlyMap<string, Collection>;
  sizes: ReadonlyMap<string, Size>;
}

/* ── Sorting ────────────────────────────────────────────────────────────── */

export const byNewest = (a: Product, b: Product) =>
  b.createdAt.localeCompare(a.createdAt) || a.slug.localeCompare(b.slug);

const byRank = (a: Product, b: Product) => (a.bestsellerRank ?? Infinity) - (b.bestsellerRank ?? Infinity);

/** Featured pieces first, then best sellers by rank, then newest. */
export const byFeatured = (a: Product, b: Product) =>
  Number(b.isFeatured) - Number(a.isFeatured) || byRank(a, b) || byNewest(a, b);

const comparators: Record<ProductSort, (a: Product, b: Product) => number> = {
  featured: byFeatured,
  newest: byNewest,
  "price-asc": (a, b) => a.price - b.price || byNewest(a, b),
  "price-desc": (a, b) => b.price - a.price || byNewest(a, b),
};

export function sortProducts(products: readonly Product[], sort: ProductSort): Product[] {
  return [...products].sort(comparators[sort]);
}

export function newestProducts(products: readonly Product[], limit: number): Product[] {
  return sortProducts(products, "newest").slice(0, Math.max(0, limit));
}

export function bestsellers(products: readonly Product[], limit: number): Product[] {
  return products
    .filter((product) => product.bestsellerRank !== null)
    .sort((a, b) => byRank(a, b) || byNewest(a, b))
    .slice(0, Math.max(0, limit));
}

/* ── Filtering ──────────────────────────────────────────────────────────── */

/** Resolves size filters given as ids ("w32") or labels ("32", "M"). */
function resolveSizeIds(values: readonly string[], sizes: ReadonlyMap<string, Size>): Set<string> {
  const wanted = new Set(values.map((value) => value.trim().toLowerCase()));
  const ids = new Set<string>();
  for (const size of sizes.values()) {
    if (wanted.has(size.id.toLowerCase()) || wanted.has(size.label.toLowerCase())) ids.add(size.id);
  }
  return ids;
}

const validPrice = (value: Kobo | undefined): value is Kobo =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Products narrowed by the category/virtual category and collection, before facet filters. */
function scopeProducts(products: readonly Product[], query: ProductQuery, context: QueryContext): Product[] {
  let scoped = [...products];

  if (query.category) {
    if (isVirtualCategory(query.category)) {
      scoped =
        query.category === "new-arrivals"
          ? newestProducts(scoped, NEW_ARRIVALS_LIMIT)
          : scoped.filter((product) => product.compareAtPrice !== null);
    } else {
      const category = context.categoriesBySlug.get(query.category);
      scoped = category ? scoped.filter((product) => product.categoryId === category.id) : [];
    }
  }

  if (query.collection) {
    const collection = context.collectionsBySlug.get(query.collection);
    scoped = collection ? scoped.filter((product) => product.collectionIds.includes(collection.id)) : [];
  }

  return scoped;
}

/**
 * Size, colour and stock filters apply to a single variant, so "M in Olive,
 * in stock" only matches when that exact variant can be bought.
 */
function matchesVariantFilters(
  product: Product,
  sizeIds: Set<string> | null,
  colorIds: Set<string> | null,
  inStockOnly: boolean,
): boolean {
  if (!sizeIds && !colorIds && !inStockOnly) return true;
  return product.variants.some(
    (variant) =>
      variant.isActive &&
      (!sizeIds || sizeIds.has(variant.sizeId)) &&
      (!colorIds || colorIds.has(variant.colorId)) &&
      (!inStockOnly || isPurchasable(variant)),
  );
}

export function filterProducts(products: readonly Product[], query: ProductQuery, context: QueryContext): Product[] {
  const sizeIds = query.sizes?.length ? resolveSizeIds(query.sizes, context.sizes) : null;
  const colorIds = query.colors?.length ? new Set(query.colors.map((color) => color.trim().toLowerCase())) : null;
  const minPrice = validPrice(query.minPrice) ? query.minPrice : null;
  const maxPrice = validPrice(query.maxPrice) ? query.maxPrice : null;

  return scopeProducts(products, query, context).filter(
    (product) =>
      (minPrice === null || product.price >= minPrice) &&
      (maxPrice === null || product.price <= maxPrice) &&
      matchesVariantFilters(product, sizeIds, colorIds, query.inStockOnly === true),
  );
}

/* ── Pagination ─────────────────────────────────────────────────────────── */

export function normalizePagination(page?: number, pageSize?: number): { page: number; pageSize: number } {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page as number)) : 1;
  const safeSize = Number.isFinite(pageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize as number)))
    : DEFAULT_PAGE_SIZE;
  return { page: safePage, pageSize: safeSize };
}

/** New arrivals default to newest-first; everything else to the featured order. */
export function defaultSort(query: ProductQuery): ProductSort {
  return query.category === "new-arrivals" ? "newest" : "featured";
}

export interface QueryResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export function queryProducts(products: readonly Product[], query: ProductQuery, context: QueryContext): QueryResult {
  const matched = sortProducts(filterProducts(products, query, context), query.sort ?? defaultSort(query));
  const { page, pageSize } = normalizePagination(query.page, query.pageSize);
  const start = (page - 1) * pageSize;
  return { items: matched.slice(start, start + pageSize), total: matched.length, page, pageSize };
}
