import { shopConfig, type PriceBand } from "@/config/shop";
import { formatPrice } from "@/lib/format";

import type { ProductQuery, ProductSort } from "./types";

/*
 * The listing URL contract, shared by server pages (URL → query) and client
 * controls (change → URL). Filters live in the query string, so every state is
 * linkable, shareable and rendered on the server:
 *
 *   /shop/shirts?collection=coastline&size=m&size=l&color=olive&price=40000-80000&stock=in&sort=price-asc&page=2
 *
 * Plain module: safe on client and server. Values are untrusted input, so parsing
 * is tolerant — anything malformed is dropped rather than failing the page.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ListingParams {
  /** Null means the listing's own default order. */
  sort: ProductSort | null;
  /** Size ids, e.g. "m" or "w32". */
  sizes: string[];
  /** Colour ids (slugs), e.g. "olive". */
  colors: string[];
  /** A price band id from `shopConfig.priceBands`. */
  price: string | null;
  inStock: boolean;
  /** Collection slug. A filter on shop and category pages; ignored where the collection is the page. */
  collection: string | null;
  page: number;
}

export const EMPTY_LISTING_PARAMS: ListingParams = {
  sort: null,
  sizes: [],
  colors: [],
  price: null,
  inStock: false,
  collection: null,
  page: 1,
};

/** Every filter switched off. Sort order is a preference, not a filter, so it survives. */
export const CLEARED_FILTERS: Pick<ListingParams, "sizes" | "colors" | "price" | "inStock" | "collection"> = {
  sizes: [],
  colors: [],
  price: null,
  inStock: false,
  collection: null,
};

const TOKEN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_VALUES_PER_KEY = 24;
const MAX_PAGE = 999;

/** All valid values for a key, accepting repeated keys and comma lists, de-duplicated in order. */
function readValues(raw: RawSearchParams, key: string): string[] {
  const value = raw[key];
  const entries = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const tokens = entries
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => TOKEN.test(entry));
  return [...new Set(tokens)].slice(0, MAX_VALUES_PER_KEY);
}

function readFirst(raw: RawSearchParams, key: string): string | null {
  return readValues(raw, key)[0] ?? null;
}

const SORT_VALUES = new Set<string>(shopConfig.sortOptions.map((option) => option.value));

export function isProductSort(value: string): value is ProductSort {
  return SORT_VALUES.has(value);
}

export function findPriceBand(id: string | null): PriceBand | null {
  if (!id) return null;
  return shopConfig.priceBands.find((band) => band.id === id) ?? null;
}

export function parseListingParams(raw: RawSearchParams): ListingParams {
  const sort = readFirst(raw, "sort");
  const page = Number(readFirst(raw, "page"));

  return {
    sort: sort !== null && isProductSort(sort) ? sort : null,
    sizes: readValues(raw, "size"),
    colors: readValues(raw, "color"),
    price: findPriceBand(readFirst(raw, "price"))?.id ?? null,
    inStock: readFirst(raw, "stock") === "in",
    collection: readFirst(raw, "collection"),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Canonical query string: fixed key order, defaults omitted, so equal states share one URL. */
export function serializeListingParams(params: ListingParams): string {
  const search = new URLSearchParams();
  if (params.collection) search.set("collection", params.collection);
  for (const size of params.sizes) search.append("size", size);
  for (const color of params.colors) search.append("color", color);
  if (params.price) search.set("price", params.price);
  if (params.inStock) search.set("stock", "in");
  if (params.sort) search.set("sort", params.sort);
  if (params.page > 1) search.set("page", String(params.page));
  return search.toString();
}

export function listingHref(basePath: string, params: ListingParams): string {
  const query = serializeListingParams(params);
  return query ? `${basePath}?${query}` : basePath;
}

/** Translates URL state into a repository query. `scope` is the page itself (its category or collection). */
export function toProductQuery(
  params: ListingParams,
  scope: { category?: string; collection?: string },
  pageSize: number,
): ProductQuery {
  const band = findPriceBand(params.price);
  return {
    category: scope.category,
    collection: scope.collection ?? params.collection ?? undefined,
    sizes: params.sizes,
    colors: params.colors,
    minPrice: band?.min ?? undefined,
    // Bands are half-open; the query's maximum is inclusive.
    maxPrice: band?.max != null ? band.max - 1 : undefined,
    inStockOnly: params.inStock,
    sort: params.sort ?? undefined,
    page: params.page,
    pageSize,
  };
}

export function countActiveFilters(params: ListingParams): number {
  return (
    params.sizes.length +
    params.colors.length +
    (params.price ? 1 : 0) +
    (params.inStock ? 1 : 0) +
    (params.collection ? 1 : 0)
  );
}

/** Anything beyond the plain first page. Such URLs stay out of search indexes. */
export function hasRefinements(params: ListingParams): boolean {
  return countActiveFilters(params) > 0 || params.sort !== null || params.page > 1;
}

/** "Under ₦40,000", "₦40,000 – ₦80,000", "₦150,000 and over". */
export function priceBandLabel(band: PriceBand): string {
  if (band.min === null && band.max !== null) return `Under ${formatPrice(band.max)}`;
  if (band.max === null && band.min !== null) return `${formatPrice(band.min)} and over`;
  if (band.min !== null && band.max !== null) return `${formatPrice(band.min)} – ${formatPrice(band.max)}`;
  return "Any price";
}
