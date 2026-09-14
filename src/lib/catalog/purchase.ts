import { availableUnits, stockStatus } from "./inventory";
import type { Kobo, ProductDetail, SizeSystem, StockStatus } from "./types";

/*
 * Variant selection for the product page. The server builds a lean, serialisable
 * model of what can be bought; the client only ever chooses among these variant
 * ids. The bag is still re-priced and re-checked on the server (cart quote), so
 * nothing here is trusted beyond showing the right controls.
 *
 * Pure (no server-only imports), so it is shared by the page and the client panel.
 */

export interface PurchaseVariant {
  id: string;
  colorId: string;
  sizeId: string;
  price: Kobo;
  /** Most that can go in the bag at once: available units, capped at the per-line limit. 0 = sold out. */
  maxQuantity: number;
  stock: StockStatus;
  /** Units left, only when stock is genuinely low — never invented, never shown otherwise. */
  lowStockRemaining: number | null;
}

export interface PurchaseColor {
  id: string;
  name: string;
  hex: string;
  /** Any size of this colour can be bought. */
  available: boolean;
}

export interface PurchaseSize {
  id: string;
  label: string;
}

export interface ProductPurchaseOptions {
  productId: string;
  name: string;
  price: Kobo;
  compareAtPrice: Kobo | null;
  fit: string | null;
  modelNote: string | null;
  colors: PurchaseColor[];
  sizes: PurchaseSize[];
  sizeSystem: SizeSystem;
  variants: PurchaseVariant[];
  /** The colour worn in the photographs, so other colours can say so. */
  photographedColorId: string | null;
}

export function buildPurchaseOptions(product: ProductDetail, maxQuantityPerLine: number): ProductPurchaseOptions {
  const variants: PurchaseVariant[] = product.variants
    .filter((variant) => variant.isActive)
    .map((variant) => {
      const available = availableUnits(variant.inventory);
      const stock = stockStatus(variant.inventory);
      return {
        id: variant.id,
        colorId: variant.colorId,
        sizeId: variant.sizeId,
        price: variant.priceOverride ?? product.price,
        maxQuantity: Math.min(available, maxQuantityPerLine),
        stock,
        lowStockRemaining: stock === "low_stock" ? available : null,
      };
    });

  return {
    productId: product.id,
    name: product.name,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    fit: product.fit,
    modelNote: product.modelNote,
    colors: product.colors.map((color) => ({
      id: color.id,
      name: color.name,
      hex: color.hex,
      available: variants.some((variant) => variant.colorId === color.id && variant.maxQuantity > 0),
    })),
    sizes: product.sizes.map((size) => ({ id: size.id, label: size.label })),
    sizeSystem: product.sizes[0]?.system ?? "one-size",
    variants,
    photographedColorId: product.images.find((image) => image.role === "primary")?.colorId ?? null,
  };
}

export function findVariant(options: ProductPurchaseOptions, colorId: string, sizeId: string): PurchaseVariant | null {
  return options.variants.find((variant) => variant.colorId === colorId && variant.sizeId === sizeId) ?? null;
}

/** Opens on the first colour that can be bought (the photographed one, when it can). */
export function initialColorId(options: ProductPurchaseOptions): string | null {
  return (options.colors.find((color) => color.available) ?? options.colors[0])?.id ?? null;
}

/** One-size pieces need no choice, so their only size starts selected. */
export function initialSizeId(options: ProductPurchaseOptions): string | null {
  return options.sizes.length === 1 ? options.sizes[0].id : null;
}

export interface SizeState extends PurchaseSize {
  variant: PurchaseVariant | null;
  available: boolean;
}

/** Every offered size for one colour, with whether that exact variant can be bought. */
export function sizeStates(options: ProductPurchaseOptions, colorId: string): SizeState[] {
  return options.sizes.map((size) => {
    const variant = findVariant(options, colorId, size.id);
    return { ...size, variant, available: (variant?.maxQuantity ?? 0) > 0 };
  });
}

export function isSoldOut(options: ProductPurchaseOptions): boolean {
  return !options.colors.some((color) => color.available);
}
