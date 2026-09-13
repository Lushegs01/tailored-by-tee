import "server-only";

import type {
  CartLineInput,
  CartQuote,
  Category,
  CategorySummary,
  Collection,
  ProductCardData,
  ProductDetail,
  ProductListResult,
  ProductQuery,
  SearchResults,
} from "./types";

/*
 * STUB — replaced by the seed-backed implementation (data agent).
 * The exported signatures are the contract every UI component codes against;
 * Phase 8 re-implements them with Prisma.
 */

export async function getCategories(): Promise<Category[]> {
  return [];
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  return [];
}

export async function getCategoryBySlug(_slug: string): Promise<Category | null> {
  return null;
}

export async function getCollections(): Promise<Collection[]> {
  return [];
}

export async function getCollectionBySlug(_slug: string): Promise<Collection | null> {
  return null;
}

export async function listProducts(_query: ProductQuery = {}): Promise<ProductListResult> {
  return { items: [], total: 0, page: 1, pageSize: 24 };
}

export async function getNewArrivals(_limit = 8): Promise<ProductCardData[]> {
  return [];
}

export async function getBestsellers(_limit = 10): Promise<ProductCardData[]> {
  return [];
}

export async function getProductsBySlugs(_slugs: string[]): Promise<ProductCardData[]> {
  return [];
}

export async function getProductBySlug(_slug: string): Promise<ProductDetail | null> {
  return null;
}

export async function searchCatalog(query: string, _limit = 6): Promise<SearchResults> {
  return { query, products: [], categories: [], collections: [] };
}

export async function quoteCart(_lines: CartLineInput[]): Promise<CartQuote> {
  return {
    currency: "NGN",
    lines: [],
    itemCount: 0,
    subtotal: 0,
    freeDeliveryThreshold: 0,
    amountToFreeDelivery: 0,
    issues: [],
  };
}
