/**
 * Catalogue domain model.
 *
 * Mirrors the planned Prisma schema (Phase 8) so the seed-backed repository can be
 * swapped for database queries without touching UI code.
 *
 * Money is always integer kobo (₦1 = 100 kobo) — the same minor unit Paystack uses —
 * so no floating-point arithmetic ever touches a price.
 */
import type { MediaAsset } from "@/lib/media/types";

export type Kobo = number;

/* ── Reference data ─────────────────────────────────────────────────────── */

/** Size systems let trousers use waist sizes and accessories use "One Size". */
export type SizeSystem = "apparel" | "waist" | "belt" | "one-size";

export interface Size {
  id: string;
  label: string;
  system: SizeSystem;
  sortOrder: number;
}

export interface Color {
  id: string;
  slug: string;
  name: string;
  hex: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: MediaAsset | null;
  sortOrder: number;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  /** e.g. "Collection 04" */
  code: string | null;
  /** e.g. "Harmattan 2026" */
  season: string | null;
  summary: string;
  description: string;
  heroImage: MediaAsset | null;
  images: MediaAsset[];
  sortOrder: number;
  isFeatured: boolean;
}

/* ── Products & variants ────────────────────────────────────────────────── */

export type ProductStatus = "draft" | "active" | "archived";
export type ProductBadge = "new" | "limited" | "restocked" | "online-exclusive";
export type ProductImageRole = "primary" | "alternate" | "gallery" | "detail";

export interface ProductImage extends MediaAsset {
  id: string;
  role: ProductImageRole;
  /** Null when the image applies to every colour. */
  colorId: string | null;
  position: number;
}

/** Stock is tracked per variant (colour × size), never per product. */
export interface InventoryLevel {
  onHand: number;
  /** Held by in-flight checkouts; not purchasable. */
  reserved: number;
  lowStockThreshold: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  colorId: string;
  sizeId: string;
  /** Overrides the product price for this variant only (rare). */
  priceOverride: Kobo | null;
  inventory: InventoryLevel;
  isActive: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** One line, used on cards, search results and meta descriptions. */
  summary: string;
  description: string;
  details: string[];
  material: string;
  care: string[];
  fit: string | null;
  /** e.g. "Model is 188cm and wears a size M." */
  modelNote: string | null;
  price: Kobo;
  compareAtPrice: Kobo | null;
  categoryId: string;
  collectionIds: string[];
  tags: string[];
  badge: ProductBadge | null;
  status: ProductStatus;
  isFeatured: boolean;
  /** Lower is better; null when not a best seller. */
  bestsellerRank: number | null;
  /** Display order of available colours. */
  colorIds: string[];
  /** Display order of sizes offered. */
  sizeIds: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  seo: { title: string | null; description: string | null };
  createdAt: string;
  updatedAt: string;
}

/* ── Read models (what the UI consumes) ─────────────────────────────────── */

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface ColorOption {
  id: string;
  slug: string;
  name: string;
  hex: string;
}

export interface QuickAddOption {
  colorId: string;
  colorName: string;
  sizes: { variantId: string; label: string; available: boolean }[];
}

/** Lean, serialisable shape for product cards (safe to pass to client components). */
export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  href: string;
  price: Kobo;
  compareAtPrice: Kobo | null;
  badge: ProductBadge | null;
  category: { slug: string; name: string };
  image: MediaAsset;
  hoverImage: MediaAsset | null;
  colors: ColorOption[];
  /** Sizes for the first in-stock colour; null when nothing is purchasable. */
  quickAdd: QuickAddOption | null;
  isSoldOut: boolean;
}

export interface ProductDetail extends Product {
  category: Category;
  collections: Collection[];
  colors: Color[];
  sizes: Size[];
}

export interface CategorySummary extends Category {
  productCount: number;
}

export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc";

export interface ProductQuery {
  /** Category slug, or the virtual categories "new-arrivals" and "sale". */
  category?: string;
  collection?: string;
  sizes?: string[];
  colors?: string[];
  minPrice?: Kobo;
  maxPrice?: Kobo;
  inStockOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

export interface ProductListResult {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchResults {
  query: string;
  products: ProductCardData[];
  categories: { slug: string; name: string; href: string }[];
  collections: { slug: string; name: string; href: string }[];
}

/* ── Cart (server-priced) ───────────────────────────────────────────────── */

/** The only thing the client is trusted to send: which variant, how many. */
export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface CartQuoteLine {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;
  href: string;
  colorName: string;
  sizeLabel: string;
  image: MediaAsset;
  unitPrice: Kobo;
  compareAtUnitPrice: Kobo | null;
  quantity: number;
  lineTotal: Kobo;
  /** Purchasable units (onHand − reserved). */
  available: number;
  stockStatus: StockStatus;
}

export interface CartIssue {
  variantId: string;
  kind: "not_found" | "unavailable" | "quantity_reduced";
  message: string;
}

export interface CartQuote {
  currency: "NGN";
  lines: CartQuoteLine[];
  itemCount: number;
  subtotal: Kobo;
  freeDeliveryThreshold: Kobo;
  amountToFreeDelivery: Kobo;
  issues: CartIssue[];
}
