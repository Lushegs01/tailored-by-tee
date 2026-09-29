import "server-only";

import { siteConfig } from "@/config/site";
import { Prisma } from "@/generated/prisma/client";
import type { ProductBadge, ProductStatus } from "@/generated/prisma/enums";
import { fromDbEnum } from "@/lib/catalog/db-enums";
import { toProductDetail, type ReferenceData } from "@/lib/catalog/mappers";
import type {
  Category as CatalogCategory,
  Collection as CatalogCollection,
  Color as CatalogColor,
  Product as CatalogProduct,
  ProductBadge as CatalogProductBadge,
  ProductDetail,
  ProductImage as CatalogProductImage,
  ProductImageRole as CatalogProductImageRole,
  ProductStatus as CatalogProductStatus,
  Size as CatalogSize,
  SizeSystem as CatalogSizeSystem,
} from "@/lib/catalog/types";
import { getDb } from "@/lib/db";
import type { MediaAsset } from "@/lib/media/types";

import { recordAudit } from "./audit";
import type { AdminActionResult } from "./auth";
import type { AdminThumb } from "./collections";
import { formatKobo } from "./format";
import { PAGE_SIZE, lastPage, pageOffset, type ListParams } from "./pagination";
import {
  MAX_COLLECTIONS_PER_PRODUCT,
  PRODUCT_STATUS_ALL,
  canPublish,
  normaliseProductCode,
  productCodeProblem,
  productStockState,
  publishBlockers,
  type BulkProductAction,
  type ProductStockFilter,
  type PublishFacts,
} from "./product-schema";
import { nextFreeProductSlug, productSlugProblem, productStorefrontPath, slugify } from "./slug";
import { isMissingSchemaError } from "./team";

/*
 * Products for the admin area: the list, the editor's own sections, the preview,
 * and every change to a product record itself.
 *
 * Photos (ProductImage), colours, sizes, variants and stock have their own
 * services — lib/admin/{variants,inventory} and the image actions — so this
 * module never writes them. It reads their counts to work out whether a product
 * is ready to be published.
 *
 * Every change runs in one transaction that first locks the product row (FOR NO
 * KEY UPDATE: admin edits of the same product take turns, while checkouts, whose
 * order lines only need a key-share lock on it, are never held up), then checks
 * the row is still the one the owner was looking at (`expectedUpdatedAt`) before
 * writing anything, and records its audit entry in the same transaction. Status
 * changes are conditional on the status the owner saw, so two admins — or an
 * admin and a bulk step — can't tread on each other.
 */

type Tx = Prisma.TransactionClient;

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

const DEFAULT_LOW_STOCK_THRESHOLD = siteConfig.commerce.defaultLowStockThreshold;

/** How many products a stock filter will look through before it stops. Ample for one studio's catalogue. */
const MAX_STOCK_SCAN = 2_000;

const PRODUCT_GONE = "This product no longer exists — it may have just been deleted. Go back to the product list.";
const STALE =
  "This product was changed by someone else — reload the page to see their changes, then make yours again.";
const NEEDS_MIGRATION =
  "The database needs an update before changes can be saved here. Ask your developer to run “npm run db:deploy”, then try again.";
const CHECK_FIELDS = "Please check the highlighted fields.";

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export interface AdminProductRow {
  id: string;
  name: string;
  code: string;
  slug: string;
  status: ProductStatus;
  badge: ProductBadge | null;
  isFeatured: boolean;
  price: number;
  compareAtPrice: number | null;
  category: { name: string; slug: string };
  /** The photo customers see first, or the first photo when none is set as the main one. */
  image: AdminThumb | null;
  hasPrimaryImage: boolean;
  imageCount: number;
  variantCount: number;
  activeVariantCount: number;
  /** Pieces that could be sold now across every switched-on variant. */
  available: number;
  stock: ProductStockFilter;
  updatedAt: Date;
}

export interface AdminProductList {
  rows: AdminProductRow[];
  total: number;
  /** The page actually shown (clamped to the last one). */
  page: number;
  /** True when a stock filter stopped short of the whole catalogue. */
  truncated: boolean;
}

export interface ProductCollectionLink {
  id: string;
  name: string;
  isPublished: boolean;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  code: string;
  name: string;
  summary: string;
  description: string;
  details: string[];
  material: string;
  care: string[];
  fit: string | null;
  modelNote: string | null;
  price: number;
  compareAtPrice: number | null;
  categoryId: string;
  category: { id: string; name: string; slug: string; code: string };
  collectionIds: string[];
  collections: ProductCollectionLink[];
  tags: string[];
  badge: ProductBadge | null;
  status: ProductStatus;
  isFeatured: boolean;
  bestsellerRank: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  facts: PublishFacts;
  /** Order lines that name this product: above zero, it can never be deleted. */
  orderItemCount: number;
  reviewCount: number;
  wishlistCount: number;
  colorCount: number;
  sizeCount: number;
  /** Variants carrying a price of their own, which is charged instead of the product's. */
  variantsWithOwnPrice: number;
}

export interface ProductFormOptions {
  categories: { id: string; name: string; slug: string; code: string }[];
  collections: { id: string; name: string; slug: string; isPublished: boolean }[];
}

/* ── Stock totals ───────────────────────────────────────────────────────── */

interface StockTotals {
  available: number;
  threshold: number;
  activeVariants: number;
}

const NO_STOCK: StockTotals = { available: 0, threshold: 0, activeVariants: 0 };

/**
 * Stock added up per product over its switched-on variants, in one query:
 * what can be sold now, the low-stock levels those variants carry, and how many
 * of them there are. Products with no switched-on variant are simply absent.
 */
async function stockTotals(ids: readonly string[]): Promise<Map<string, StockTotals>> {
  const totals = new Map<string, StockTotals>();
  if (ids.length === 0) return totals;

  const rows = await getDb().$queryRaw<{ productId: string; available: number; threshold: number; variants: number }[]>`
    SELECT v."productId" AS "productId",
           COALESCE(SUM(GREATEST(COALESCE(i."onHand", 0) - COALESCE(i."reserved", 0), 0)), 0)::int AS "available",
           COALESCE(SUM(COALESCE(i."lowStockThreshold", ${DEFAULT_LOW_STOCK_THRESHOLD})), 0)::int AS "threshold",
           COUNT(*)::int AS "variants"
    FROM "ProductVariant" v
    LEFT JOIN "Inventory" i ON i."variantId" = v."id"
    WHERE v."isActive" = true AND v."productId" IN (${Prisma.join([...ids])})
    GROUP BY v."productId"`;

  for (const row of rows) {
    totals.set(row.productId, {
      available: Number(row.available),
      threshold: Number(row.threshold),
      activeVariants: Number(row.variants),
    });
  }
  return totals;
}

/* ── Reading: the list ──────────────────────────────────────────────────── */

const LIST_SELECT = {
  id: true,
  name: true,
  code: true,
  slug: true,
  status: true,
  badge: true,
  isFeatured: true,
  price: true,
  compareAtPrice: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  images: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { role: true, media: { select: { url: true, alt: true, color: true } } },
  },
  _count: { select: { images: true, variants: true } },
} as const satisfies Prisma.ProductSelect;

type ListRow = Prisma.ProductGetPayload<{ select: typeof LIST_SELECT }>;

function listWhere(params: ListParams, categoryId: string | null, collectionId: string | null): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  const status = params.filters.status;
  if (status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED") where.status = status;
  else if (status !== PRODUCT_STATUS_ALL) where.status = { in: ["DRAFT", "ACTIVE"] };

  if (categoryId) where.categoryId = categoryId;
  if (collectionId) where.collections = { some: { collectionId } };

  const q = params.q.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

function listOrder(params: ListParams): Prisma.ProductOrderByWithRelationInput[] {
  const dir = params.dir;
  switch (params.sort) {
    case "name":
      return [{ name: dir }, { id: "asc" }];
    case "price":
      return [{ price: dir }, { id: "asc" }];
    default:
      return [{ updatedAt: dir }, { id: "asc" }];
  }
}

function toRow(row: ListRow, totals: StockTotals): AdminProductRow {
  const primary = row.images.find((image) => image.role === "PRIMARY");
  const shown = primary ?? row.images[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    slug: row.slug,
    status: row.status,
    badge: row.badge,
    isFeatured: row.isFeatured,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    category: row.category,
    image: shown ? { url: shown.media.url, alt: shown.media.alt, color: shown.media.color } : null,
    hasPrimaryImage: primary !== undefined,
    imageCount: row._count.images,
    variantCount: row._count.variants,
    activeVariantCount: totals.activeVariants,
    available: totals.available,
    stock: productStockState(totals),
    updatedAt: row.updatedAt,
  };
}

/**
 * One page of the product list. A stock filter can't be expressed in the query —
 * it adds up each product's variants — so with one set, the matching ids are read
 * in order first (up to MAX_STOCK_SCAN), filtered, and only then paged.
 */
export async function listAdminProducts(
  params: ListParams,
  options: { categoryId?: string | null; collectionId?: string | null; pageSize?: number } = {},
): Promise<AdminProductList> {
  const db = getDb();
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const where = listWhere(params, options.categoryId ?? null, options.collectionId ?? null);
  const orderBy = listOrder(params);
  const stockFilter = params.filters.stock as ProductStockFilter | undefined;

  let total: number;
  let pageIds: string[];
  let shownPage: number;
  let truncated = false;
  let totals: Map<string, StockTotals>;

  /** The page actually shown: what was asked for, never past the last one. */
  const clamp = (count: number) => Math.min(Math.max(1, params.page), lastPage(count, pageSize));

  if (stockFilter) {
    const scanned = await db.product.findMany({ where, orderBy, select: { id: true }, take: MAX_STOCK_SCAN + 1 });
    truncated = scanned.length > MAX_STOCK_SCAN;
    const ids = scanned.slice(0, MAX_STOCK_SCAN).map((row) => row.id);
    totals = await stockTotals(ids);
    const matching = ids.filter((id) => productStockState(totals.get(id) ?? NO_STOCK) === stockFilter);
    total = matching.length;
    shownPage = clamp(total);
    const from = pageOffset(shownPage, pageSize);
    pageIds = matching.slice(from, from + pageSize);
  } else {
    const [count, page] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy,
        select: { id: true },
        skip: pageOffset(params.page, pageSize),
        take: pageSize,
      }),
    ]);
    total = count;
    shownPage = clamp(total);
    pageIds = page.map((row) => row.id);
    // Asked for a page past the end (a filter narrowed the list, or a bookmark):
    // show the last page rather than nothing, and say so in what is returned.
    if (pageIds.length === 0 && shownPage !== params.page && total > 0) {
      const lastRows = await db.product.findMany({
        where,
        orderBy,
        select: { id: true },
        skip: pageOffset(shownPage, pageSize),
        take: pageSize,
      });
      pageIds = lastRows.map((row) => row.id);
    }
    totals = await stockTotals(pageIds);
  }

  if (pageIds.length === 0) return { rows: [], total, page: shownPage, truncated };

  const rows = await db.product.findMany({ where: { id: { in: pageIds } }, select: LIST_SELECT });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    rows: pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toRow(row, totals.get(id) ?? NO_STOCK)] : [];
    }),
    total,
    page: shownPage,
    truncated,
  };
}

/* ── Reading: one product ───────────────────────────────────────────────── */

/**
 * The few facts another section needs about a product: its name, code, status and
 * its category's code (the first parts of every SKU). Null when it doesn't exist.
 */
export async function getAdminProductHeader(id: string): Promise<{
  id: string;
  name: string;
  code: string;
  slug: string;
  status: ProductStatus;
  categoryCode: string;
} | null> {
  const product = await getDb().product.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, slug: true, status: true, category: { select: { code: true } } },
  });
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    slug: product.slug,
    status: product.status,
    categoryCode: product.category.code,
  };
}

/** Just the name, for page titles. */
export async function getProductName(id: string): Promise<string | null> {
  const product = await getDb().product.findUnique({ where: { id }, select: { name: true } });
  return product?.name ?? null;
}

/** Everything the editor shows for one product, or null when it doesn't exist. */
export async function getAdminProduct(id: string): Promise<AdminProductDetail | null> {
  const db = getDb();
  const [product, totals, variantsWithOwnPrice] = await Promise.all([
    db.product.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        code: true,
        name: true,
        summary: true,
        description: true,
        details: true,
        material: true,
        care: true,
        fit: true,
        modelNote: true,
        price: true,
        compareAtPrice: true,
        categoryId: true,
        tags: true,
        badge: true,
        status: true,
        isFeatured: true,
        bestsellerRank: true,
        seoTitle: true,
        seoDescription: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true, code: true } },
        collections: {
          orderBy: [{ position: "asc" }, { collectionId: "asc" }],
          select: { collection: { select: { id: true, name: true, isPublished: true } } },
        },
        images: { select: { role: true } },
        _count: {
          select: {
            images: true,
            variants: true,
            orderItems: true,
            reviews: true,
            wishlistItems: true,
            colors: true,
            sizes: true,
          },
        },
      },
    }),
    stockTotals([id]),
    db.productVariant.count({ where: { productId: id, priceOverride: { not: null } } }),
  ]);
  if (!product) return null;

  const stock = totals.get(id) ?? NO_STOCK;
  const collections = product.collections.map((link) => link.collection);

  return {
    id: product.id,
    slug: product.slug,
    code: product.code,
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
    category: product.category,
    collectionIds: collections.map((collection) => collection.id),
    collections,
    tags: product.tags,
    badge: product.badge,
    status: product.status,
    isFeatured: product.isFeatured,
    bestsellerRank: product.bestsellerRank,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    facts: {
      price: product.price,
      imageCount: product._count.images,
      hasPrimaryImage: product.images.some((image) => image.role === "PRIMARY"),
      variantCount: product._count.variants,
      activeVariantCount: stock.activeVariants,
      availableToSell: stock.available,
      hasCopy: product.summary.trim() !== "" && product.description.trim() !== "" && product.material.trim() !== "",
    },
    orderItemCount: product._count.orderItems,
    reviewCount: product._count.reviews,
    wishlistCount: product._count.wishlistItems,
    colorCount: product._count.colors,
    sizeCount: product._count.sizes,
    variantsWithOwnPrice,
  };
}

/** The categories and collections the editor's selects offer. */
export async function getProductFormOptions(): Promise<ProductFormOptions> {
  const db = getDb();
  const [categories, collections] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, code: true },
    }),
    db.collection.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, isPublished: true },
    }),
  ]);
  return { categories, collections };
}

/** Product codes already in use, so the new-product form can suggest a free one. */
export async function listProductCodes(): Promise<string[]> {
  const rows = await getDb().product.findMany({ select: { code: true } });
  return rows.map((row) => row.code);
}

/**
 * Web addresses already in use, so the new-product form can show the address the
 * piece will actually get. The server picks the address itself when it saves, so
 * this is only for the preview — a piece created a second later still gets a free
 * one.
 */
export async function listProductSlugs(): Promise<string[]> {
  const rows = await getDb().product.findMany({ select: { slug: true } });
  return rows.map((row) => row.slug);
}

/** The category a slug names, for the list's ?category= filter. */
export async function findCategoryBySlug(slug: string): Promise<{ id: string; name: string } | null> {
  return getDb().category.findUnique({ where: { slug }, select: { id: true, name: true } });
}

/** The collection a slug names, for the list's ?collection= filter. */
export async function findCollectionBySlug(slug: string): Promise<{ id: string; name: string } | null> {
  return getDb().collection.findUnique({ where: { slug }, select: { id: true, name: true } });
}

/* ── Reading: the preview ───────────────────────────────────────────────── */

function toMediaAsset(media: {
  url: string;
  width: number;
  height: number;
  alt: string;
  color: string;
  blurDataUrl: string | null;
  creditName: string | null;
  creditUrl: string | null;
}): MediaAsset {
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

export interface ProductPreview {
  product: ProductDetail;
  status: ProductStatus;
  updatedAt: Date;
  /** The colours a photo is set to that the product no longer offers. */
  strayImageColors: string[];
}

/**
 * One product read straight from the database and mapped exactly as the shop
 * maps it (lib/catalog/sources/database.ts → lib/catalog/mappers.ts), so the
 * preview shows what a customer would see — including drafts, which never reach
 * the shop's cached catalogue. Nothing here is cached, and nothing it returns is
 * ever written back into a public cache.
 */
export async function getProductPreview(id: string): Promise<ProductPreview | null> {
  const db = getDb();
  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      summary: true,
      description: true,
      details: true,
      material: true,
      care: true,
      fit: true,
      modelNote: true,
      price: true,
      compareAtPrice: true,
      categoryId: true,
      tags: true,
      badge: true,
      status: true,
      isFeatured: true,
      bestsellerRank: true,
      seoTitle: true,
      seoDescription: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, slug: true, name: true, description: true, sortOrder: true, image: true } },
      colors: { orderBy: [{ position: "asc" }, { colorId: "asc" }], select: { color: true } },
      sizes: { orderBy: [{ position: "asc" }, { sizeId: "asc" }], select: { size: true } },
      collections: {
        orderBy: [{ position: "asc" }, { collectionId: "asc" }],
        select: { collection: { select: { id: true, slug: true, name: true } } },
      },
      images: { orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, role: true, colorId: true, position: true, media: true } },
      variants: {
        orderBy: { sku: "asc" },
        select: {
          id: true,
          sku: true,
          colorId: true,
          sizeId: true,
          priceOverride: true,
          isActive: true,
          inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
        },
      },
    },
  });
  if (!product) return null;

  const colors: CatalogColor[] = product.colors.map((link) => ({
    id: link.color.id,
    slug: link.color.id,
    name: link.color.name,
    hex: link.color.hex,
  }));
  const sizes: CatalogSize[] = product.sizes.map((link) => ({
    id: link.size.id,
    label: link.size.label,
    system: fromDbEnum<CatalogSizeSystem>(link.size.system),
    sortOrder: link.size.sortOrder,
  }));
  const category: CatalogCategory = {
    id: product.category.id,
    slug: product.category.slug,
    name: product.category.name,
    description: product.category.description,
    image: product.category.image ? toMediaAsset(product.category.image) : null,
    sortOrder: product.category.sortOrder,
  };
  const collections: CatalogCollection[] = product.collections.map((link) => ({
    id: link.collection.id,
    slug: link.collection.slug,
    name: link.collection.name,
    code: null,
    season: null,
    summary: "",
    description: "",
    heroImage: null,
    images: [],
    sortOrder: 0,
    isFeatured: false,
  }));

  const images: CatalogProductImage[] = product.images.map((image) => ({
    ...toMediaAsset(image.media),
    id: image.id,
    role: fromDbEnum<CatalogProductImageRole>(image.role),
    colorId: image.colorId,
    position: image.position,
  }));

  const domain: CatalogProduct = {
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
    collectionIds: collections.map((collection) => collection.id),
    tags: product.tags,
    badge: product.badge ? fromDbEnum<CatalogProductBadge>(product.badge) : null,
    status: fromDbEnum<CatalogProductStatus>(product.status),
    isFeatured: product.isFeatured,
    bestsellerRank: product.bestsellerRank,
    colorIds: colors.map((color) => color.id),
    sizeIds: sizes.map((size) => size.id),
    images,
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
        lowStockThreshold: variant.inventory?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
      },
    })),
    seo: { title: product.seoTitle, description: product.seoDescription },
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };

  const ref: ReferenceData = {
    colors: new Map(colors.map((color) => [color.id, color])),
    sizes: new Map(sizes.map((size) => [size.id, size])),
    categories: new Map([[category.id, category]]),
    collections: new Map(collections.map((collection) => [collection.id, collection])),
  };

  const detail = toProductDetail(domain, ref);
  if (!detail) return null;

  const offered = new Set(domain.colorIds);
  const stray = new Set<string>();
  for (const image of product.images) {
    if (image.colorId && !offered.has(image.colorId)) stray.add(image.colorId);
  }

  return { product: detail, status: product.status, updatedAt: product.updatedAt, strayImageColors: [...stray] };
}

/* ── Write helpers ──────────────────────────────────────────────────────── */

type FieldFailure = { ok: false; message: string; fieldErrors: Record<string, string> };

function fieldFailure(field: string, message: string, rootMessage = CHECK_FIELDS): FieldFailure {
  return { ok: false, message: rootMessage, fieldErrors: { [field]: message } };
}

function prismaCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

function knownFailure(error: unknown): { ok: false; message: string } | null {
  return isMissingSchemaError(error) ? { ok: false, message: NEEDS_MIGRATION } : null;
}

interface LockedProduct {
  id: string;
  status: ProductStatus;
  updatedAt: Date;
}

/** Locks the product row for the rest of the transaction. Null when it doesn't exist. */
async function lockProduct(tx: Tx, id: string): Promise<LockedProduct | null> {
  const rows = await tx.$queryRaw<{ id: string; status: ProductStatus; updatedAt: Date }[]>`
    SELECT "id", "status"::text AS "status", "updatedAt"
    FROM "Product" WHERE "id" = ${id} FOR NO KEY UPDATE`;
  return rows[0] ?? null;
}

/** True when the row has moved on since the form was opened. */
function isStale(locked: LockedProduct, expectedUpdatedAt: string): boolean {
  const expected = Date.parse(expectedUpdatedAt);
  return !Number.isFinite(expected) || locked.updatedAt.getTime() !== expected;
}

async function slugTakenMessage(tx: Tx, slug: string, ownerName: string): Promise<string> {
  const taken = await tx.product.findMany({ where: { slug: { startsWith: slug } }, select: { slug: true } });
  const suggestion = nextFreeProductSlug(
    slug,
    taken.map((row) => row.slug),
  );
  return `“${ownerName}” already uses ${productStorefrontPath(slug)}. Try ${suggestion}.`;
}

async function codeTakenMessage(tx: Tx, code: string): Promise<string | null> {
  const owner = await tx.product.findFirst({ where: { code }, select: { name: true } });
  return owner ? `“${owner.name}” already uses ${code}. Each product needs its own code.` : null;
}

/** The counts the publish checklist needs, read inside the transaction. */
async function readFacts(tx: Tx, id: string): Promise<PublishFacts | null> {
  const product = await tx.product.findUnique({
    where: { id },
    select: {
      price: true,
      summary: true,
      description: true,
      material: true,
      images: { select: { role: true } },
      _count: { select: { images: true, variants: true } },
    },
  });
  if (!product) return null;

  const rows = await tx.$queryRaw<{ available: number; variants: number }[]>`
    SELECT COALESCE(SUM(GREATEST(COALESCE(i."onHand", 0) - COALESCE(i."reserved", 0), 0)), 0)::int AS "available",
           COUNT(*)::int AS "variants"
    FROM "ProductVariant" v
    LEFT JOIN "Inventory" i ON i."variantId" = v."id"
    WHERE v."isActive" = true AND v."productId" = ${id}`;
  const stock = rows[0] ?? { available: 0, variants: 0 };

  return {
    price: product.price,
    imageCount: product._count.images,
    hasPrimaryImage: product.images.some((image) => image.role === "PRIMARY"),
    variantCount: product._count.variants,
    activeVariantCount: Number(stock.variants),
    availableToSell: Number(stock.available),
    hasCopy: product.summary.trim() !== "" && product.description.trim() !== "" && product.material.trim() !== "",
  };
}

/* ── Creating ───────────────────────────────────────────────────────────── */

export interface CreateProductData {
  name: string;
  categoryId: string;
  /** Integer kobo. */
  price: number;
  /** As typed; kept to three capital letters. */
  code: string;
}

export interface CreatedProduct {
  id: string;
  name: string;
  slug: string;
  code: string;
}

/**
 * Creates a draft with the few facts a piece can't exist without. Everything else
 * — the words, photos, colours, sizes and stock — is added in the editor, which
 * the action opens next.
 */
export async function createProduct(
  input: CreateProductData,
  actorId: string,
): Promise<AdminActionResult<CreatedProduct>> {
  const code = normaliseProductCode(input.code);
  const codeProblem = productCodeProblem(code);
  if (codeProblem) return fieldFailure("code", codeProblem);

  const base = slugify(input.name);
  if (base === "") {
    return fieldFailure("name", "Use at least one letter or number in the name, so the piece can have a web address.");
  }

  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<CreatedProduct>> => {
      const category = await tx.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true, name: true, code: true },
      });
      if (!category) return fieldFailure("categoryId", "That category no longer exists. Choose another.");

      const codeOwner = await tx.product.findFirst({ where: { code }, select: { name: true } });
      if (codeOwner) {
        return fieldFailure("code", `“${codeOwner.name}” already uses ${code}. Each product needs its own code.`);
      }

      const taken = await tx.product.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
      const slug = nextFreeProductSlug(
        base,
        taken.map((row) => row.slug),
      );
      const slugProblem = productSlugProblem(slug);
      if (slugProblem) return fieldFailure("name", slugProblem);

      const created = await tx.product.create({
        data: {
          name: input.name,
          slug,
          code,
          summary: "",
          description: "",
          details: [],
          material: "",
          care: [],
          tags: [],
          price: input.price,
          categoryId: category.id,
          status: "DRAFT",
        },
        select: { id: true },
      });

      await recordAudit({
        tx,
        actorId,
        action: "product.create",
        entityType: "Product",
        entityId: created.id,
        summary: `Created the draft product “${input.name}” (${code}) in ${category.name} at ${formatKobo(input.price)}.`,
        metadata: { slug, code, price: input.price, categoryId: category.id },
      });

      return {
        ok: true,
        data: { id: created.id, name: input.name, slug, code },
        message: "Draft created.",
      };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      const clash = await explainUniqueClash({ slug: base, code }, null);
      if (clash) return clash;
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** After a unique-index clash outside the friendly checks (two saves at once): name the field. */
async function explainUniqueClash(
  input: { slug: string; code: string | null },
  selfId: string | null,
): Promise<FieldFailure | null> {
  const db = getDb();
  const notSelf = selfId ? { id: { not: selfId } } : {};
  const fieldErrors: Record<string, string> = {};

  const slugOwner = await db.product.findFirst({ where: { slug: input.slug, ...notSelf }, select: { name: true } });
  if (slugOwner) fieldErrors.slug = await slugTakenMessage(db, input.slug, slugOwner.name);

  if (input.code) {
    const codeOwner = await db.product.findFirst({ where: { code: input.code, ...notSelf }, select: { id: true } });
    if (codeOwner) fieldErrors.code = (await codeTakenMessage(db, input.code)) ?? "That code is already in use.";
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, message: CHECK_FIELDS, fieldErrors } : null;
}

/* ── Saving a section ───────────────────────────────────────────────────── */

export interface ProductBasicsData {
  section: "basics";
  name: string;
  /** As typed ("" = make one from the name); cleaned with slugify. */
  slug: string;
  confirmSlugChange: boolean;
  /** Null when the form didn't send one (a locked code). */
  code: string | null;
  summary: string;
  description: string;
  details: string[];
  material: string;
  care: string[];
  fit: string | null;
  modelNote: string | null;
}

export interface ProductOrganisationData {
  section: "organisation";
  categoryId: string;
  collectionIds: string[];
  tags: string[];
  badge: ProductBadge | null;
  isFeatured: boolean;
  bestsellerRank: number | null;
}

export interface ProductPricingData {
  section: "pricing";
  price: number;
  compareAtPrice: number | null;
}

export interface ProductSeoData {
  section: "seo";
  seoTitle: string | null;
  seoDescription: string | null;
}

export type ProductSectionData =
  | ProductBasicsData
  | ProductOrganisationData
  | ProductPricingData
  | ProductSeoData;

export interface ProductSaveOutcome {
  id: string;
  name: string;
  slug: string;
  previousSlug: string;
  /** The fields that actually changed, in the owner's words. */
  changed: string[];
}

const SECTION_LABELS: Record<ProductSectionData["section"], string> = {
  basics: "Basics",
  organisation: "Organisation",
  pricing: "Pricing",
  seo: "Search engines",
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  slug: "web address",
  code: "code",
  summary: "summary",
  description: "description",
  details: "details",
  material: "material",
  care: "care",
  fit: "fit",
  modelNote: "model note",
  categoryId: "category",
  collections: "collections",
  tags: "tags",
  badge: "badge",
  isFeatured: "featured",
  bestsellerRank: "best-seller position",
  price: "price",
  compareAtPrice: "original price",
  seoTitle: "search title",
  seoDescription: "search description",
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Saves one section of the editor. The product row is locked first, then checked
 * against `expectedUpdatedAt` — the moment the form was opened — so a save built
 * on someone else's out-of-date page is refused rather than silently overwriting
 * theirs.
 */
export async function saveProductSection(
  id: string,
  expectedUpdatedAt: string,
  input: ProductSectionData,
  actorId: string,
): Promise<AdminActionResult<ProductSaveOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<ProductSaveOutcome>> => {
      const locked = await lockProduct(tx, id);
      if (!locked) return { ok: false, message: PRODUCT_GONE };
      if (isStale(locked, expectedUpdatedAt)) return { ok: false, message: STALE };

      const current = await tx.product.findUniqueOrThrow({
        where: { id },
        select: {
          name: true,
          slug: true,
          code: true,
          summary: true,
          description: true,
          details: true,
          material: true,
          care: true,
          fit: true,
          modelNote: true,
          categoryId: true,
          tags: true,
          badge: true,
          isFeatured: true,
          bestsellerRank: true,
          price: true,
          compareAtPrice: true,
          seoTitle: true,
          seoDescription: true,
          status: true,
        },
      });

      const built = await buildSectionUpdate(tx, id, input, current);
      if ("ok" in built) return built;

      const { data, changed, notes } = built;
      if (changed.length === 0) {
        return {
          ok: true,
          data: { id, name: current.name, slug: current.slug, previousSlug: current.slug, changed: [] },
          message: "Nothing had changed, so there was nothing to save.",
        };
      }

      await tx.product.update({ where: { id }, data, select: { id: true } });
      if (built.afterUpdate) await built.afterUpdate(tx);

      const name = typeof data.name === "string" ? data.name : current.name;
      const slug = typeof data.slug === "string" ? data.slug : current.slug;
      const labels = changed.map((key) => FIELD_LABELS[key] ?? key);

      await recordAudit({
        tx,
        actorId,
        action: `product.${input.section}`,
        entityType: "Product",
        entityId: id,
        summary: `Updated “${name}” (${SECTION_LABELS[input.section]}): ${labels.join(", ")}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}.`,
        metadata: { section: input.section, changed: labels },
      });

      return {
        ok: true,
        data: { id, name, slug, previousSlug: current.slug, changed: labels },
        message: `${SECTION_LABELS[input.section]} saved.`,
      };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      const slug = input.section === "basics" ? slugify(input.slug || input.name) : "";
      const code = input.section === "basics" ? input.code && normaliseProductCode(input.code) : null;
      const clash = await explainUniqueClash({ slug, code: code || null }, id);
      if (clash) return clash;
    }
    if (prismaCode(error) === "P2003") {
      return fieldFailure("categoryId", "That category was removed a moment ago. Choose another.");
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

type CurrentProduct = {
  name: string;
  slug: string;
  code: string;
  summary: string;
  description: string;
  details: string[];
  material: string;
  care: string[];
  fit: string | null;
  modelNote: string | null;
  categoryId: string;
  tags: string[];
  badge: ProductBadge | null;
  isFeatured: boolean;
  bestsellerRank: number | null;
  price: number;
  compareAtPrice: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: ProductStatus;
};

interface SectionUpdate {
  data: Prisma.ProductUpdateInput;
  changed: string[];
  notes: string[];
  afterUpdate?: (tx: Tx) => Promise<void>;
}

async function buildSectionUpdate(
  tx: Tx,
  id: string,
  input: ProductSectionData,
  current: CurrentProduct,
): Promise<SectionUpdate | FieldFailure | { ok: false; message: string }> {
  switch (input.section) {
    case "basics":
      return buildBasicsUpdate(tx, id, input, current);
    case "organisation":
      return buildOrganisationUpdate(tx, id, input, current);
    case "pricing":
      return buildPricingUpdate(input, current);
    case "seo":
      return buildSeoUpdate(input, current);
  }
}

async function buildBasicsUpdate(
  tx: Tx,
  id: string,
  input: ProductBasicsData,
  current: CurrentProduct,
): Promise<SectionUpdate | FieldFailure> {
  const slug = slugify(input.slug || input.name);
  const slugProblem = productSlugProblem(slug);
  if (slugProblem) return fieldFailure("slug", slugProblem);

  // The code is printed in every SKU, so it is settled once variants exist.
  let code = current.code;
  if (input.code !== null) {
    const typed = normaliseProductCode(input.code);
    const problem = productCodeProblem(typed);
    if (problem) return fieldFailure("code", problem);
    if (typed !== current.code) {
      const variantCount = await tx.productVariant.count({ where: { productId: id } });
      if (variantCount > 0) {
        return fieldFailure(
          "code",
          `The code can’t change: ${variantCount} ${variantCount === 1 ? "SKU already includes" : "SKUs already include"} ${current.code}.`,
        );
      }
      const owner = await tx.product.findFirst({ where: { code: typed, id: { not: id } }, select: { name: true } });
      if (owner) return fieldFailure("code", `“${owner.name}” already uses ${typed}. Each product needs its own code.`);
    }
    code = typed;
  }

  if (slug !== current.slug) {
    const owner = await tx.product.findFirst({ where: { slug, id: { not: id } }, select: { name: true } });
    if (owner) return fieldFailure("slug", await slugTakenMessage(tx, slug, owner.name));
    if (!input.confirmSlugChange) {
      return fieldFailure(
        "confirmSlugChange",
        "Tick the box to confirm changing the web address.",
        "Changing the web address needs your confirmation.",
      );
    }
  }

  const next = {
    name: input.name,
    slug,
    code,
    summary: input.summary,
    description: input.description,
    material: input.material,
    fit: input.fit,
    modelNote: input.modelNote,
  };
  const changed: string[] = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
  if (!sameList(input.details, current.details)) changed.push("details");
  if (!sameList(input.care, current.care)) changed.push("care");

  const notes: string[] = [];
  if (changed.includes("slug")) notes.push(`web address ${current.slug} → ${slug}`);
  if (changed.includes("code")) notes.push(`code ${current.code} → ${code}`);

  return { data: { ...next, details: input.details, care: input.care }, changed, notes };
}

async function buildOrganisationUpdate(
  tx: Tx,
  id: string,
  input: ProductOrganisationData,
  current: CurrentProduct,
): Promise<SectionUpdate | FieldFailure> {
  const category = await tx.category.findUnique({ where: { id: input.categoryId }, select: { id: true, name: true } });
  if (!category) return fieldFailure("categoryId", "That category no longer exists. Choose another.");

  const chosen = [...new Set(input.collectionIds)].slice(0, MAX_COLLECTIONS_PER_PRODUCT);
  const known = await tx.collection.findMany({ where: { id: { in: chosen } }, select: { id: true, name: true } });
  if (known.length !== chosen.length) {
    return fieldFailure("collectionIds", "One of those collections no longer exists. Refresh the page and try again.");
  }
  const existing = await tx.productCollection.findMany({ where: { productId: id }, select: { collectionId: true } });
  const before = new Set(existing.map((link) => link.collectionId));
  const after = new Set(chosen);
  const added = chosen.filter((collectionId) => !before.has(collectionId));
  const removed = [...before].filter((collectionId) => !after.has(collectionId));

  const next = {
    categoryId: input.categoryId,
    badge: input.badge,
    isFeatured: input.isFeatured,
    bestsellerRank: input.bestsellerRank,
  };
  const changed: string[] = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
  if (!sameList(input.tags, current.tags)) changed.push("tags");
  if (added.length > 0 || removed.length > 0) changed.push("collections");

  const data: Prisma.ProductUpdateInput = {
    badge: input.badge,
    isFeatured: input.isFeatured,
    bestsellerRank: input.bestsellerRank,
    tags: input.tags,
    ...(input.categoryId !== current.categoryId ? { category: { connect: { id: input.categoryId } } } : {}),
  };

  const notes: string[] = [];
  if (changed.includes("categoryId")) notes.push(`category → ${category.name}`);
  if (added.length > 0) notes.push(`added to ${added.length} ${added.length === 1 ? "collection" : "collections"}`);
  if (removed.length > 0) {
    notes.push(`taken out of ${removed.length} ${removed.length === 1 ? "collection" : "collections"}`);
  }

  const afterUpdate = async (client: Tx) => {
    if (removed.length > 0) {
      await client.productCollection.deleteMany({ where: { productId: id, collectionId: { in: removed } } });
    }
    for (const collectionId of added) {
      // New pieces join the end of the collection, as the collection editor does.
      const last = await client.productCollection.aggregate({
        where: { collectionId },
        _max: { position: true },
      });
      await client.productCollection.create({
        data: { productId: id, collectionId, position: (last._max.position ?? -1) + 1 },
        select: { productId: true },
      });
    }
  };

  return { data, changed, notes, afterUpdate };
}

function buildPricingUpdate(input: ProductPricingData, current: CurrentProduct): SectionUpdate | FieldFailure {
  if (input.compareAtPrice !== null && input.compareAtPrice <= input.price) {
    return fieldFailure(
      "compareAtPrice",
      "The original price must be higher than the price, or left empty. Nothing is crossed out unless the piece is reduced.",
    );
  }
  const next = { price: input.price, compareAtPrice: input.compareAtPrice };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
  const notes: string[] = [];
  if (changed.includes("price")) notes.push(`${formatKobo(current.price)} → ${formatKobo(input.price)}`);
  return { data: next, changed, notes };
}

function buildSeoUpdate(input: ProductSeoData, current: CurrentProduct): SectionUpdate {
  const next = { seoTitle: input.seoTitle, seoDescription: input.seoDescription };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
  return { data: next, changed, notes: [] };
}

/* ── Status ─────────────────────────────────────────────────────────────── */

export interface ProductStatusOutcome {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  previousStatus: ProductStatus;
}

const STATUS_WORDS: Record<ProductStatus, string> = {
  DRAFT: "moved to draft",
  ACTIVE: "published",
  ARCHIVED: "archived",
};

const STATUS_MESSAGES: Record<ProductStatus, string> = {
  DRAFT: "Moved to draft. It has left the shop.",
  ACTIVE: "Published. It’s in the shop now.",
  ARCHIVED: "Archived. It has left the shop and is kept for past orders.",
};

/**
 * Publishes, unpublishes or archives one product. The update is conditional on
 * the status the owner was looking at, so a change someone else made first is
 * reported rather than overwritten. Publishing is refused until the checklist
 * passes, checked here rather than trusted from the page.
 */
export async function setProductStatus(
  id: string,
  expectedStatus: ProductStatus,
  status: ProductStatus,
  actorId: string,
): Promise<AdminActionResult<ProductStatusOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<ProductStatusOutcome>> => {
      const locked = await lockProduct(tx, id);
      if (!locked) return { ok: false, message: PRODUCT_GONE };

      const product = await tx.product.findUniqueOrThrow({
        where: { id },
        select: { name: true, slug: true, status: true },
      });

      if (product.status !== expectedStatus) {
        return {
          ok: false,
          message: `Someone else changed this product first — it is now ${statusWord(product.status)}. Reload the page to see the latest.`,
        };
      }
      if (product.status === status) {
        return {
          ok: true,
          data: { id, name: product.name, slug: product.slug, status, previousStatus: status },
          message: "It was already like that, so there was nothing to change.",
        };
      }

      if (status === "ACTIVE") {
        const facts = await readFacts(tx, id);
        if (!facts) return { ok: false, message: PRODUCT_GONE };
        if (!canPublish(facts)) {
          return { ok: false, message: `It isn’t ready to publish yet. ${publishBlockers(facts).join(" ")}` };
        }
      }

      const written = await tx.product.updateMany({ where: { id, status: expectedStatus }, data: { status } });
      if (written.count === 0) {
        return { ok: false, message: "Someone else changed this product first. Reload the page to see the latest." };
      }

      await recordAudit({
        tx,
        actorId,
        action: `product.${status === "ACTIVE" ? "publish" : status === "DRAFT" ? "unpublish" : "archive"}`,
        entityType: "Product",
        entityId: id,
        summary: `${capitalise(STATUS_WORDS[status])} “${product.name}”.`,
        metadata: { from: product.status, to: status },
      });

      return {
        ok: true,
        data: { id, name: product.name, slug: product.slug, status, previousStatus: product.status },
        message: STATUS_MESSAGES[status],
      };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

function statusWord(status: ProductStatus): string {
  return status === "ACTIVE" ? "published" : status === "DRAFT" ? "a draft" : "archived";
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ── Several at once ────────────────────────────────────────────────────── */

export interface BulkProductOutcome {
  action: BulkProductAction;
  /** How many actually moved. */
  changed: number;
  /** Already in that state. */
  unchanged: number;
  /** Chosen but no longer there. */
  missing: number;
  /** Names of products that aren't ready to publish, and why. */
  blocked: { name: string; reason: string }[];
  /** The web addresses that changed, for revalidation. */
  slugs: string[];
}

/**
 * Publishes, unpublishes or archives several products from the list. Each one is
 * checked on its own: publishing skips anything not ready and names it afterwards,
 * rather than quietly doing part of the job.
 */
export async function bulkUpdateProductStatus(
  ids: readonly string[],
  action: BulkProductAction,
  actorId: string,
): Promise<AdminActionResult<BulkProductOutcome>> {
  const status: ProductStatus = action === "publish" ? "ACTIVE" : action === "unpublish" ? "DRAFT" : "ARCHIVED";

  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<BulkProductOutcome>> => {
      // One fixed order, so two bulk steps can never deadlock against each other.
      await tx.$queryRaw`
        SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join([...ids])}) ORDER BY "id" FOR NO KEY UPDATE`;

      const products = await tx.product.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true, slug: true, status: true },
      });
      const missing = ids.length - products.length;
      const already = products.filter((product) => product.status === status);
      const candidates = products.filter((product) => product.status !== status);

      const blocked: { name: string; reason: string }[] = [];
      const eligible: typeof candidates = [];
      for (const product of candidates) {
        if (action !== "publish") {
          eligible.push(product);
          continue;
        }
        const facts = await readFacts(tx, product.id);
        if (facts && canPublish(facts)) eligible.push(product);
        else blocked.push({ name: product.name, reason: facts ? publishBlockers(facts).join(" ") : PRODUCT_GONE });
      }

      let changed = 0;
      if (eligible.length > 0) {
        const written = await tx.product.updateMany({
          where: { id: { in: eligible.map((product) => product.id) }, status: { not: status } },
          data: { status },
        });
        changed = written.count;
      }

      if (changed > 0) {
        await recordAudit({
          tx,
          actorId,
          action: `products.${action}`,
          entityType: "Product",
          entityId: eligible.length === 1 ? eligible[0].id : null,
          summary: `${capitalise(STATUS_WORDS[status])} ${changed} ${changed === 1 ? "product" : "products"}: ${eligible
            .slice(0, 5)
            .map((product) => `“${product.name}”`)
            .join(", ")}${eligible.length > 5 ? ` and ${eligible.length - 5} more` : ""}.`,
          metadata: { action, ids: eligible.map((product) => product.id), to: status },
        });
      }

      return {
        ok: true,
        data: {
          action,
          changed,
          unchanged: already.length,
          missing,
          blocked,
          slugs: eligible.map((product) => product.slug),
        },
      };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/* ── Deleting ───────────────────────────────────────────────────────────── */

export interface DeletedProduct {
  name: string;
  slug: string;
}

/**
 * Deletes a draft that has never been ordered, with its colours, sizes, variants,
 * photo links and stock. Anything a customer has ever bought is kept for ever —
 * the order lines point at it — so those are archived instead.
 */
export async function deleteProduct(id: string, actorId: string): Promise<AdminActionResult<DeletedProduct>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<DeletedProduct>> => {
      const locked = await lockProduct(tx, id);
      if (!locked) return { ok: false, message: PRODUCT_GONE };

      const product = await tx.product.findUniqueOrThrow({
        where: { id },
        select: { name: true, slug: true, code: true, status: true, _count: { select: { orderItems: true } } },
      });

      if (product.status !== "DRAFT") {
        return {
          ok: false,
          message: `Only a draft can be deleted. “${product.name}” is ${statusWord(product.status)} — archive it instead, which hides it from the shop and keeps it for past orders.`,
        };
      }
      if (product._count.orderItems > 0) {
        return {
          ok: false,
          message: `“${product.name}” has been ordered ${product._count.orderItems === 1 ? "once" : `${product._count.orderItems} times`}, so it is kept for those orders. Archive it instead.`,
        };
      }

      await tx.product.delete({ where: { id }, select: { id: true } });
      await recordAudit({
        tx,
        actorId,
        action: "product.delete",
        entityType: "Product",
        entityId: id,
        summary: `Deleted the draft product “${product.name}” (${product.code}).`,
        metadata: { name: product.name, slug: product.slug, code: product.code },
      });

      return { ok: true, data: { name: product.name, slug: product.slug }, message: `Deleted “${product.name}”.` };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2003") {
      return { ok: false, message: "This product was ordered a moment ago, so it can’t be deleted. Archive it instead." };
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}
