import type { MediaAsset, ProductMediaEntry } from "@/lib/media/types";

import { availableUnits, isPurchasable, seedInventory } from "./inventory";
import type { CategorySeed } from "./seed/categories";
import { colorSkuCode } from "./seed/colors";
import { sizeSkuCode } from "./seed/sizes";
import type { ProductSeed } from "./seed/types";
import type {
  Category,
  Collection,
  Color,
  ColorOption,
  Product,
  ProductCardData,
  ProductDetail,
  ProductImage,
  ProductVariant,
  QuickAddOption,
  Size,
} from "./types";

/*
 * Seed → domain → read-model mapping. Pure: media and config are passed in, so
 * this runs the same in tests as it does on the server.
 */

/** Reference data every mapper needs, keyed by id. */
export interface ReferenceData {
  colors: ReadonlyMap<string, Color>;
  sizes: ReadonlyMap<string, Size>;
  categories: ReadonlyMap<string, Category>;
  collections: ReadonlyMap<string, Collection>;
}

export const productId = (slug: string) => `prod_${slug}`;
export const categoryId = (slug: string) => `cat_${slug}`;
export const collectionId = (slug: string) => `col_${slug}`;
export const productHref = (slug: string) => `/product/${slug}`;

/** Strips extra fields (role, position…) so only the lean asset crosses to the client. */
export function toMediaAsset(image: MediaAsset): MediaAsset {
  const asset: MediaAsset = {
    src: image.src,
    width: image.width,
    height: image.height,
    alt: image.alt,
    color: image.color,
  };
  if (image.blurDataURL) asset.blurDataURL = image.blurDataURL;
  return asset;
}

/* ── Seed → Product ─────────────────────────────────────────────────────── */

export interface BuildProductContext {
  categoryCode: CategorySeed["code"];
  media: ProductMediaEntry | null;
  lowStockThreshold: number;
}

export function buildSku(categoryCode: string, seed: ProductSeed, colorId: ProductSeed["colors"][number], sizeId: ProductSeed["sizes"][number]) {
  return ["TBT", categoryCode, seed.code, colorSkuCode(colorId), sizeSkuCode(sizeId)].join("-");
}

function buildVariants(seed: ProductSeed, context: BuildProductContext): ProductVariant[] {
  const soldOutColors = new Set<string>(seed.stock?.soldOutColors ?? []);
  const edgeSizes =
    seed.sizes.length >= 4 ? new Set<string>([seed.sizes[0], seed.sizes[seed.sizes.length - 1]]) : new Set<string>();

  const variants = seed.colors.flatMap((colorId) =>
    seed.sizes.map((sizeId): ProductVariant => {
      const sku = buildSku(context.categoryCode, seed, colorId, sizeId);
      const soldOut = seed.stock?.soldOut === true || soldOutColors.has(colorId);
      return {
        id: `var_${sku.toLowerCase()}`,
        sku,
        colorId,
        sizeId,
        priceOverride: null,
        inventory: soldOut
          ? { onHand: 0, reserved: 0, lowStockThreshold: context.lowStockThreshold }
          : seedInventory(sku, { lowStockThreshold: context.lowStockThreshold, isEdgeSize: edgeSizes.has(sizeId) }),
        isActive: true,
      };
    }),
  );

  // Seeded stock is random-ish; only deliberate sell-outs may leave a whole colourway empty.
  for (const colorId of seed.colors) {
    if (seed.stock?.soldOut || soldOutColors.has(colorId)) continue;
    const colourway = variants.filter((variant) => variant.colorId === colorId);
    if (colourway.some((variant) => availableUnits(variant.inventory) > 0)) continue;
    const core = colourway[Math.floor(colourway.length / 2)];
    core.inventory = { ...core.inventory, onHand: 2, reserved: 0 };
  }

  return variants;
}

function buildImages(seed: ProductSeed, media: ProductMediaEntry | null): ProductImage[] {
  if (!media) return [];
  const colorId = seed.colors[0];
  const id = productId(seed.slug);
  return [
    { ...toMediaAsset(media.primary), id: `${id}_primary`, role: "primary", colorId, position: 0 },
    { ...toMediaAsset(media.alternate), id: `${id}_alternate`, role: "alternate", colorId, position: 1 },
  ];
}

export function buildProduct(seed: ProductSeed, context: BuildProductContext): Product {
  return {
    id: productId(seed.slug),
    slug: seed.slug,
    name: seed.name,
    summary: seed.summary,
    description: seed.description,
    details: [...seed.details],
    material: seed.material,
    care: [...seed.care],
    fit: seed.fit,
    modelNote: seed.modelNote,
    price: seed.price,
    compareAtPrice: seed.compareAtPrice ?? null,
    categoryId: categoryId(seed.category),
    collectionIds: seed.collections.map(collectionId),
    tags: [...seed.tags],
    badge: seed.badge ?? null,
    status: seed.status ?? "active",
    isFeatured: seed.isFeatured ?? false,
    bestsellerRank: seed.bestsellerRank ?? null,
    colorIds: [...seed.colors],
    sizeIds: [...seed.sizes],
    images: buildImages(seed, context.media),
    variants: buildVariants(seed, context),
    seo: { title: null, description: null },
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt ?? seed.createdAt,
  };
}

/* ── Product → read models ──────────────────────────────────────────────── */

export function findImage(product: Product, role: ProductImage["role"], colorId?: string): ProductImage | null {
  const candidates = product.images.filter((image) => image.role === role);
  return (
    candidates.find((image) => colorId !== undefined && image.colorId === colorId) ??
    candidates.find((image) => image.colorId === null || image.colorId === product.colorIds[0]) ??
    candidates[0] ??
    null
  );
}

export function isProductSoldOut(product: Product): boolean {
  return !product.variants.some(isPurchasable);
}

function toColorOption(color: Color): ColorOption {
  return { id: color.id, slug: color.slug, name: color.name, hex: color.hex };
}

function productColors(product: Product, ref: ReferenceData): Color[] {
  return product.colorIds.flatMap((id) => ref.colors.get(id) ?? []);
}

function productSizes(product: Product, ref: ReferenceData): Size[] {
  return product.sizeIds.flatMap((id) => ref.sizes.get(id) ?? []);
}

/** The first colour with anything purchasable, with its sizes in size order. */
export function buildQuickAdd(product: Product, ref: ReferenceData): QuickAddOption | null {
  for (const colorId of product.colorIds) {
    const colourway = product.variants.filter((variant) => variant.colorId === colorId && variant.isActive);
    if (!colourway.some(isPurchasable)) continue;

    const sizes = product.sizeIds.flatMap((sizeId) => {
      const variant = colourway.find((candidate) => candidate.sizeId === sizeId);
      if (!variant) return [];
      return [{ variantId: variant.id, label: ref.sizes.get(sizeId)?.label ?? sizeId, available: isPurchasable(variant) }];
    });

    return { colorId, colorName: ref.colors.get(colorId)?.name ?? colorId, sizes };
  }
  return null;
}

/** Card read model. Returns null when the product has no photography to show. */
export function toProductCardData(product: Product, ref: ReferenceData): ProductCardData | null {
  const primary = findImage(product, "primary");
  const category = ref.categories.get(product.categoryId);
  if (!primary || !category) return null;
  const alternate = findImage(product, "alternate");
  const quickAdd = buildQuickAdd(product, ref);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    href: productHref(product.slug),
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    badge: product.badge,
    category: { slug: category.slug, name: category.name },
    image: toMediaAsset(primary),
    hoverImage: alternate ? toMediaAsset(alternate) : null,
    colors: productColors(product, ref).map(toColorOption),
    quickAdd,
    isSoldOut: quickAdd === null,
  };
}

export function toProductDetail(product: Product, ref: ReferenceData): ProductDetail | null {
  const category = ref.categories.get(product.categoryId);
  if (!category) return null;
  return {
    ...product,
    category,
    collections: product.collectionIds.flatMap((id) => ref.collections.get(id) ?? []),
    colors: productColors(product, ref),
    sizes: productSizes(product, ref),
  };
}
