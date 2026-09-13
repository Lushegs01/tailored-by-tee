import "server-only";

import { siteConfig } from "@/config/site";
import { getMedia, getProductMedia } from "@/lib/media";

import {
  buildProduct,
  categoryId,
  collectionId,
  findImage,
  toMediaAsset,
  toProductCardData,
  toProductDetail,
  type ReferenceData,
} from "./mappers";
import { bestsellers, newestProducts, queryProducts, type QueryContext } from "./query";
import { buildCartQuote, type ResolvedVariant } from "./quote";
import { buildSearchDocument, matchesLabels, parseQuery, rankDocuments, type SearchDocument } from "./search";
import { CATEGORY_SEEDS } from "./seed/categories";
import { COLLECTION_SEEDS } from "./seed/collections";
import { COLORS } from "./seed/colors";
import { PRODUCT_SEEDS } from "./seed/products";
import { SIZES } from "./seed/sizes";
import type {
  CartLineInput,
  CartQuote,
  Category,
  CategorySummary,
  Collection,
  Product,
  ProductCardData,
  ProductDetail,
  ProductListResult,
  ProductQuery,
  ProductVariant,
  SearchResults,
} from "./types";
import { VIRTUAL_CATEGORIES } from "./virtual-categories";

/*
 * The storefront's only data access surface. Backed by the in-memory seed
 * catalogue today; Phase 8 re-implements these signatures with Prisma, and no
 * component needs to change.
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

let store: CatalogStore | null = null;

function getStore(): CatalogStore {
  store ??= buildStore();
  return store;
}

function buildStore(): CatalogStore {
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

  const categoryCodes = new Map(CATEGORY_SEEDS.map((seed) => [seed.slug, seed.code]));
  const unphotographed: string[] = [];

  const all = PRODUCT_SEEDS.map((seed) => {
    const media = getProductMedia(seed.slug);
    if (!media) unphotographed.push(seed.slug);
    return buildProduct(seed, {
      categoryCode: categoryCodes.get(seed.category) ?? "GEN",
      media,
      lowStockThreshold: siteConfig.commerce.defaultLowStockThreshold,
    });
  });

  if (unphotographed.length > 0 && process.env.NODE_ENV === "development") {
    console.warn(`[catalog] Hidden until photographed: ${unphotographed.join(", ")}`);
  }

  const ref: ReferenceData = {
    colors: new Map(COLORS.map((color) => [color.id, color])),
    sizes: new Map(SIZES.map((size) => [size.id, size])),
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
    },
  };
}

function toCards(products: readonly Product[]): ProductCardData[] {
  const { cards } = getStore();
  return products.flatMap((product) => cards.get(product.id) ?? []);
}

/* ── Categories & collections ───────────────────────────────────────────── */

export async function getCategories(): Promise<Category[]> {
  return getStore().categories;
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  const { categories, products } = getStore();
  return categories.map((category) => ({
    ...category,
    productCount: products.filter((product) => product.categoryId === category.id).length,
  }));
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return getStore().queryContext.categoriesBySlug.get(slug) ?? null;
}

export async function getCollections(): Promise<Collection[]> {
  return getStore().collections;
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  return getStore().queryContext.collectionsBySlug.get(slug) ?? null;
}

/* ── Products ───────────────────────────────────────────────────────────── */

export async function listProducts(query: ProductQuery = {}): Promise<ProductListResult> {
  const { products, queryContext } = getStore();
  const result = queryProducts(products, query, queryContext);
  return { items: toCards(result.items), total: result.total, page: result.page, pageSize: result.pageSize };
}

export async function getNewArrivals(limit = 8): Promise<ProductCardData[]> {
  return toCards(newestProducts(getStore().products, limit));
}

export async function getBestsellers(limit = 10): Promise<ProductCardData[]> {
  return toCards(bestsellers(getStore().products, limit));
}

export async function getProductsBySlugs(slugs: string[]): Promise<ProductCardData[]> {
  const { productsBySlug } = getStore();
  return toCards(slugs.flatMap((slug) => productsBySlug.get(slug) ?? []));
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const { productsBySlug, ref } = getStore();
  const product = productsBySlug.get(slug);
  return product ? toProductDetail(product, ref) : null;
}

/* ── Search ─────────────────────────────────────────────────────────────── */

export async function searchCatalog(query: string, limit = 6): Promise<SearchResults> {
  const parsed = parseQuery(query);
  const empty: SearchResults = { query, products: [], categories: [], collections: [] };
  if (parsed.tokens.length === 0) return empty;

  const { searchDocuments, cards, categories, collections } = getStore();
  const cap = Math.min(24, Math.max(1, Math.floor(limit)));

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

function resolveVariant(variantId: string): ResolvedVariant | null {
  const { variants, ref } = getStore();
  const entry = variants.get(variantId);
  if (!entry) return null;

  const color = ref.colors.get(entry.variant.colorId);
  const size = ref.sizes.get(entry.variant.sizeId);
  if (!color || !size) return null;

  const image = findImage(entry.product, "primary", entry.variant.colorId);
  return { ...entry, color, size, image: image ? toMediaAsset(image) : null };
}

/** Prices a bag from variant ids + quantities alone. Input is re-validated here. */
export async function quoteCart(lines: CartLineInput[]): Promise<CartQuote> {
  return buildCartQuote(lines, resolveVariant, {
    maxQuantityPerLine: siteConfig.commerce.maxQuantityPerLine,
    freeDeliveryThreshold: siteConfig.commerce.freeDeliveryThreshold,
  });
}
