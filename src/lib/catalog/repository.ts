import "server-only";

import { shopConfig } from "@/config/shop";
import { siteConfig } from "@/config/site";

import { findImage, isProductSoldOut, toMediaAsset, toProductCardData, toProductDetail, type ReferenceData } from "./mappers";
import { bestsellers, buildFacets, byFeatured, newestProducts, queryProducts, type QueryContext } from "./query";
import { buildCartQuote, type ResolvedVariant } from "./quote";
import { buildSearchDocument, matchesLabels, parseQuery, rankDocuments, type SearchDocument } from "./search";
import { loadCatalog, loadLiveInventory, type CatalogSnapshot } from "./sources";
import type {
  CartLineInput,
  CartQuote,
  Category,
  CategorySummary,
  Collection,
  CollectionSummary,
  InventoryLevel,
  Product,
  ProductCardData,
  ProductDetail,
  ProductFacets,
  ProductListResult,
  ProductQuery,
  ProductVariant,
  SearchResults,
} from "./types";
import { VIRTUAL_CATEGORIES } from "./virtual-categories";

/*
 * The storefront's only data access surface. The catalogue comes from a snapshot
 * (the database, or the typed seed catalogue when none is configured — see
 * ./sources); this module indexes it once per snapshot and answers every query
 * with the pure rules in query.ts, search.ts and quote.ts. Components never know
 * which source is behind it.
 */

interface CatalogStore {
  categories: Category[];
  collections: Collection[];
  /** Active products that have photography — everything a shopper can see. */
  products: Product[];
  productsBySlug: Map<string, Product>;
  cards: Map<string, ProductCardData>;
  /** Every variant, including unlisted products, so stale bags get a clear message. */
  variants: Map<string, { product: Product; variant: ProductVariant }>;
  searchDocuments: SearchDocument[];
  ref: ReferenceData;
  queryContext: QueryContext;
}

let indexed: { version: string; store: CatalogStore } | null = null;

/** The indexed catalogue, rebuilt only when the underlying snapshot changes. */
async function getStore(): Promise<CatalogStore> {
  const snapshot = await loadCatalog();
  if (indexed?.version !== snapshot.version) indexed = { version: snapshot.version, store: buildStore(snapshot) };
  return indexed.store;
}

function buildStore({ categories, collections, products: all, colors, sizes }: CatalogSnapshot): CatalogStore {
  const unphotographed = all.filter((product) => product.status === "active" && product.images.length === 0);
  if (unphotographed.length > 0 && process.env.NODE_ENV === "development") {
    console.warn(`[catalog] Hidden until photographed: ${unphotographed.map((product) => product.slug).join(", ")}`);
  }

  const ref: ReferenceData = {
    colors: new Map(colors.map((color) => [color.id, color])),
    sizes: new Map(sizes.map((size) => [size.id, size])),
    categories: new Map(categories.map((category) => [category.id, category])),
    collections: new Map(collections.map((collection) => [collection.id, collection])),
  };

  const products = all.filter((product) => product.status === "active" && product.images.length > 0);

  const cards = new Map<string, ProductCardData>();
  for (const product of products) {
    const card = toProductCardData(product, ref);
    if (card) cards.set(product.id, card);
  }

  const variants = new Map<string, { product: Product; variant: ProductVariant }>();
  for (const product of all) {
    for (const variant of product.variants) variants.set(variant.id, { product, variant });
  }

  const searchDocuments = products.map((product) =>
    buildSearchDocument(product, {
      categoryName: ref.categories.get(product.categoryId)?.name ?? "",
      collectionNames: product.collectionIds.flatMap((id) => ref.collections.get(id)?.name ?? []),
      colorNames: product.colorIds.flatMap((id) => ref.colors.get(id)?.name ?? []),
    }),
  );

  return {
    categories,
    collections,
    products,
    productsBySlug: new Map(products.map((product) => [product.slug, product])),
    cards,
    variants,
    searchDocuments,
    ref,
    queryContext: {
      categoriesBySlug: new Map(categories.map((category) => [category.slug, category])),
      collectionsBySlug: new Map(collections.map((collection) => [collection.slug, collection])),
      sizes: ref.sizes,
      colors: ref.colors,
    },
  };
}

function toCards(store: CatalogStore, products: readonly Product[]): ProductCardData[] {
  return products.flatMap((product) => store.cards.get(product.id) ?? []);
}

/* ── Categories & collections ───────────────────────────────────────────── */

export async function getCategories(): Promise<Category[]> {
  return (await getStore()).categories;
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  const { categories, products } = await getStore();
  return categories.map((category) => ({
    ...category,
    productCount: products.filter((product) => product.categoryId === category.id).length,
  }));
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return (await getStore()).queryContext.categoriesBySlug.get(slug) ?? null;
}

export async function getCollections(): Promise<Collection[]> {
  return (await getStore()).collections;
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  return (await getStore()).queryContext.collectionsBySlug.get(slug) ?? null;
}

export async function getCollectionSummaries(): Promise<CollectionSummary[]> {
  const { collections, products } = await getStore();
  return collections.map((collection) => ({
    ...collection,
    productCount: products.filter((product) => product.collectionIds.includes(collection.id)).length,
  }));
}

/* ── Products ───────────────────────────────────────────────────────────── */

export async function listProducts(query: ProductQuery = {}): Promise<ProductListResult> {
  const store = await getStore();
  const result = queryProducts(store.products, query, store.queryContext);
  return { items: toCards(store, result.items), total: result.total, page: result.page, pageSize: result.pageSize };
}

/** Filter options (with counts) for the same query a listing page renders. */
export async function getListingFacets(query: ProductQuery = {}): Promise<ProductFacets> {
  const { products, queryContext } = await getStore();
  return buildFacets(products, query, queryContext, shopConfig.priceBands);
}

export async function getNewArrivals(limit = 8): Promise<ProductCardData[]> {
  const store = await getStore();
  return toCards(store, newestProducts(store.products, limit));
}

export async function getBestsellers(limit = 10): Promise<ProductCardData[]> {
  const store = await getStore();
  return toCards(store, bestsellers(store.products, limit));
}

export async function getProductsBySlugs(slugs: string[]): Promise<ProductCardData[]> {
  const store = await getStore();
  return toCards(
    store,
    slugs.flatMap((slug) => store.productsBySlug.get(slug) ?? []),
  );
}

/** Cards for the given product ids, in the order given. Unknown or unlisted ids are skipped. */
export async function getProductsByIds(ids: string[]): Promise<ProductCardData[]> {
  const store = await getStore();
  return ids.flatMap((id) => store.cards.get(id) ?? []);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const { productsBySlug, ref } = await getStore();
  const product = productsBySlug.get(slug);
  return product ? toProductDetail(product, ref) : null;
}

/** Every listed product's slug, for static generation and the sitemap. */
export async function getProductSlugs(): Promise<string[]> {
  return (await getStore()).products.map((product) => product.slug);
}

export interface RelatedProducts {
  /** Same collection, other categories: pieces that are worn with this one. */
  completeTheLook: ProductCardData[];
  /** Same category: alternatives to this one. */
  similar: ProductCardData[];
}

/**
 * Cross-sells for a product page. Sold-out pieces are never recommended, and the
 * two shelves never repeat each other.
 */
export async function getRelatedProducts(slug: string, limit = 4): Promise<RelatedProducts> {
  const store = await getStore();
  const product = store.productsBySlug.get(slug);
  if (!product) return { completeTheLook: [], similar: [] };

  const candidates = store.products.filter((other) => other.id !== product.id && !isProductSoldOut(other));
  const completeTheLook = candidates
    .filter(
      (other) =>
        other.categoryId !== product.categoryId &&
        other.collectionIds.some((id) => product.collectionIds.includes(id)),
    )
    .sort(byFeatured)
    .slice(0, limit);

  const shown = new Set(completeTheLook.map((other) => other.id));
  const similar = candidates
    .filter((other) => other.categoryId === product.categoryId && !shown.has(other.id))
    .sort(byFeatured)
    .slice(0, limit);

  return { completeTheLook: toCards(store, completeTheLook), similar: toCards(store, similar) };
}

/* ── Search ─────────────────────────────────────────────────────────────── */

/** Ceiling for one search, whoever asks: the typeahead requests 6, the results page 48. */
export const MAX_SEARCH_RESULTS = 48;

export async function searchCatalog(query: string, limit = 6): Promise<SearchResults> {
  const parsed = parseQuery(query);
  const empty: SearchResults = { query, products: [], categories: [], collections: [] };
  if (parsed.tokens.length === 0) return empty;

  const { searchDocuments, cards, categories, collections } = await getStore();
  const cap = Math.min(MAX_SEARCH_RESULTS, Math.max(1, Math.floor(limit)));

  const products = rankDocuments(searchDocuments, parsed)
    .slice(0, cap)
    .flatMap((document) => cards.get(document.productId) ?? []);

  const matchedCategories = [
    ...categories.map((category) => ({ slug: category.slug, name: category.name })),
    ...Object.values(VIRTUAL_CATEGORIES).map(({ slug, name }) => ({ slug, name })),
  ]
    .filter((category) => matchesLabels([category.name, category.slug], parsed.tokens))
    .map((category) => ({ ...category, href: `/shop/${category.slug}` }));

  const matchedCollections = collections
    .filter((collection) =>
      matchesLabels(
        [collection.name, collection.slug, collection.code ?? "", collection.season ?? ""],
        parsed.tokens,
      ),
    )
    .map((collection) => ({
      slug: collection.slug,
      name: collection.name,
      href: `/collections/${collection.slug}`,
    }));

  return { query, products, categories: matchedCategories, collections: matchedCollections };
}

/* ── Cart pricing ───────────────────────────────────────────────────────── */

function resolveVariant(
  store: CatalogStore,
  variantId: string,
  liveStock: Map<string, InventoryLevel> | null,
): ResolvedVariant | null {
  const entry = store.variants.get(variantId);
  if (!entry) return null;

  const color = store.ref.colors.get(entry.variant.colorId);
  const size = store.ref.sizes.get(entry.variant.sizeId);
  if (!color || !size) return null;

  // Prices and names may come from the cached catalogue; stock must not.
  const inventory = liveStock?.get(variantId);
  const variant = inventory ? { ...entry.variant, inventory } : entry.variant;

  const image = findImage(entry.product, "primary", entry.variant.colorId);
  return { product: entry.product, variant, color, size, image: image ? toMediaAsset(image) : null };
}

/** Prices a bag from variant ids + quantities alone. Input is re-validated here; stock is read live. */
export async function quoteCart(lines: CartLineInput[]): Promise<CartQuote> {
  const [store, liveStock] = await Promise.all([
    getStore(),
    loadLiveInventory(lines.map((line) => line.variantId)),
  ]);

  return buildCartQuote(lines, (variantId) => resolveVariant(store, variantId, liveStock), {
    maxQuantityPerLine: siteConfig.commerce.maxQuantityPerLine,
    freeDeliveryThreshold: siteConfig.commerce.freeDeliveryThreshold,
  });
}
