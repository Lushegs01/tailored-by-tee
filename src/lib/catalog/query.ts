import { isPurchasable } from "./inventory";
import type {
  Category,
  Collection,
  Color,
  Kobo,
  Product,
  ProductFacets,
  ProductQuery,
  ProductSort,
  Size,
} from "./types";
import { NEW_ARRIVALS_LIMIT, isVirtualCategory } from "./virtual-categories";

/*
 * Listing rules — filtering, facet counts, sorting and pagination — over an
 * in-memory product list. Pure; Phase 8 expresses the same rules as Prisma queries.
 */

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;

export interface QueryContext {
  categoriesBySlug: ReadonlyMap<string, Category>;
  collectionsBySlug: ReadonlyMap<string, Collection>;
  /** Registry order, which is also filter display order. */
  sizes: ReadonlyMap<string, Size>;
  /** Registry order, which is also filter display order. */
  colors: ReadonlyMap<string, Color>;
}

/** A price band in kobo: `min` inclusive, `max` exclusive; null leaves that side open. */
export interface PriceBandRange {
  id: string;
  min: Kobo | null;
  max: Kobo | null;
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

interface ResolvedFilters {
  sizeIds: ReadonlySet<string> | null;
  colorIds: ReadonlySet<string> | null;
  minPrice: Kobo | null;
  maxPrice: Kobo | null;
  inStockOnly: boolean;
}

/** Unknown sizes and colours are ignored, so a stale link widens instead of emptying the page. */
function resolveFilters(query: ProductQuery, context: QueryContext): ResolvedFilters {
  const sizeIds = query.sizes?.length ? resolveSizeIds(query.sizes, context.sizes) : new Set<string>();
  const colorIds = new Set(
    (query.colors ?? []).map((color) => color.trim().toLowerCase()).filter((id) => context.colors.has(id)),
  );

  return {
    sizeIds: sizeIds.size > 0 ? sizeIds : null,
    colorIds: colorIds.size > 0 ? colorIds : null,
    minPrice: validPrice(query.minPrice) ? query.minPrice : null,
    maxPrice: validPrice(query.maxPrice) ? query.maxPrice : null,
    inStockOnly: query.inStockOnly === true,
  };
}

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
  sizeIds: ReadonlySet<string> | null,
  colorIds: ReadonlySet<string> | null,
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

function inPriceRange(product: Product, { minPrice, maxPrice }: ResolvedFilters): boolean {
  return (minPrice === null || product.price >= minPrice) && (maxPrice === null || product.price <= maxPrice);
}

function matchesFilters(product: Product, filters: ResolvedFilters): boolean {
  return (
    inPriceRange(product, filters) &&
    matchesVariantFilters(product, filters.sizeIds, filters.colorIds, filters.inStockOnly)
  );
}

export function filterProducts(products: readonly Product[], query: ProductQuery, context: QueryContext): Product[] {
  const filters = resolveFilters(query, context);
  return scopeProducts(products, query, context).filter((product) => matchesFilters(product, filters));
}

/* ── Facets ─────────────────────────────────────────────────────────────── */

function countWhere(products: readonly Product[], test: (product: Product) => boolean): number {
  let count = 0;
  for (const product of products) if (test(product)) count++;
  return count;
}

/**
 * Filter options with counts. Every facet is counted against all the *other*
 * active filters (never itself), which is what lets a shopper widen a choice:
 * with "M" ticked, "L" still shows how many pieces come in L.
 */
export function buildFacets(
  products: readonly Product[],
  query: ProductQuery,
  context: QueryContext,
  priceBands: readonly PriceBandRange[],
): ProductFacets {
  const filters = resolveFilters(query, context);
  const { sizeIds, colorIds, inStockOnly } = filters;
  const scoped = scopeProducts(products, query, context);
  const priced = scoped.filter((product) => inPriceRange(product, filters));

  // "One size" pieces have nothing to choose, so the size filter skips them.
  const sizes = [...context.sizes.values()].flatMap((size) => {
    if (size.system === "one-size") return [];
    const only = new Set([size.id]);
    const count = countWhere(priced, (product) => matchesVariantFilters(product, only, colorIds, inStockOnly));
    return count > 0 || sizeIds?.has(size.id)
      ? [{ value: size.id, label: size.label, system: size.system, count }]
      : [];
  });

  const colors = [...context.colors.values()].flatMap((color) => {
    const only = new Set([color.id]);
    const count = countWhere(priced, (product) => matchesVariantFilters(product, sizeIds, only, inStockOnly));
    return count > 0 || colorIds?.has(color.id) ? [{ value: color.id, label: color.name, hex: color.hex, count }] : [];
  });

  const variantMatched = scoped.filter((product) => matchesVariantFilters(product, sizeIds, colorIds, inStockOnly));
  const prices = priceBands.map((band) => ({
    value: band.id,
    count: countWhere(
      variantMatched,
      (product) => (band.min === null || product.price >= band.min) && (band.max === null || product.price < band.max),
    ),
  }));

  const acrossCollections = scopeProducts(products, { ...query, collection: undefined }, context).filter((product) =>
    matchesFilters(product, filters),
  );
  const collections = [...context.collectionsBySlug.values()].flatMap((collection) => {
    const count = countWhere(acrossCollections, (product) => product.collectionIds.includes(collection.id));
    return count > 0 || query.collection === collection.slug
      ? [{ value: collection.slug, label: collection.name, count }]
      : [];
  });

  const inStock = countWhere(scoped, (product) => matchesFilters(product, { ...filters, inStockOnly: true }));

  return { sizes, colors, prices, collections, inStock };
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
export function defaultSort(query: Pick<ProductQuery, "category">): ProductSort {
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
