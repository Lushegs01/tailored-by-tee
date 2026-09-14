import { z } from "zod";

import type { MediaAsset } from "@/lib/media/types";

import { availableUnits, stockStatus } from "./inventory";
import { productHref } from "./mappers";
import type { CartIssue, CartQuote, CartQuoteLine, Color, Kobo, Product, ProductVariant, Size } from "./types";

/*
 * Server-side cart pricing. The client sends only variant ids and quantities;
 * everything else — price, stock, limits — is decided here. Pure: the caller
 * supplies variant lookup and commerce config.
 */

export const MAX_CART_LINES = 50;
const MAX_VARIANT_ID_LENGTH = 64;

/**
 * One line as sent by the client. Quantities above the per-line limit are
 * clamped (with an issue) rather than rejected, so a stale bag never gets stuck.
 */
export const cartLineSchema = z.object({
  variantId: z.string().trim().min(1).max(MAX_VARIANT_ID_LENGTH),
  quantity: z.number().int().min(1).max(9_999),
});

export interface ResolvedVariant {
  product: Product;
  variant: ProductVariant;
  color: Color;
  size: Size;
  /** Null when the product has no photography (and is therefore not on sale). */
  image: MediaAsset | null;
}

export interface QuoteConfig {
  maxQuantityPerLine: number;
  freeDeliveryThreshold: Kobo;
}

/** "the Straight-Leg Trousers in Stone, 32" — one-size pieces omit the size. */
function describe({ product, color, size }: ResolvedVariant): string {
  const sizePart = size.system === "one-size" ? "" : `, ${size.label}`;
  return `the ${product.name} in ${color.name}${sizePart}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Validates and merges raw input, keeping the order in which variants first appeared. */
function mergeLines(input: unknown, issues: CartIssue[]): Map<string, number> {
  const merged = new Map<string, number>();
  const rawLines = Array.isArray(input) ? input.slice(0, MAX_CART_LINES) : [];

  for (const raw of rawLines) {
    const parsed = cartLineSchema.safeParse(raw);
    if (!parsed.success) {
      const variantId = (raw as { variantId?: unknown } | null)?.variantId;
      if (typeof variantId === "string" && variantId.length > 0) {
        issues.push({
          variantId: variantId.slice(0, MAX_VARIANT_ID_LENGTH),
          kind: "not_found",
          message: "An item in your bag could not be read and has been removed.",
        });
      }
      continue;
    }
    const { variantId, quantity } = parsed.data;
    merged.set(variantId, (merged.get(variantId) ?? 0) + quantity);
  }
  return merged;
}

export function buildCartQuote(
  input: unknown,
  resolve: (variantId: string) => ResolvedVariant | null,
  config: QuoteConfig,
): CartQuote {
  const issues: CartIssue[] = [];
  const lines: CartQuoteLine[] = [];

  for (const [variantId, requested] of mergeLines(input, issues)) {
    const resolved = resolve(variantId);
    if (!resolved) {
      issues.push({
        variantId,
        kind: "not_found",
        message: "An item in your bag is no longer in our collection and has been removed.",
      });
      continue;
    }

    const { product, variant, image } = resolved;
    const available = availableUnits(variant.inventory);
    const onSale = product.status === "active" && variant.isActive && image !== null;

    if (!onSale || available === 0) {
      issues.push({
        variantId,
        kind: "unavailable",
        message: onSale
          ? `${capitalize(describe(resolved))} has sold out and has been removed from your bag.`
          : `${capitalize(describe(resolved))} is no longer available and has been removed from your bag.`,
      });
      continue;
    }

    const cap = Math.min(available, config.maxQuantityPerLine);
    const quantity = Math.min(requested, cap);
    if (quantity < requested) {
      issues.push({
        variantId,
        kind: "quantity_reduced",
        message:
          available < config.maxQuantityPerLine
            ? `Only ${available} of ${describe(resolved)} ${available === 1 ? "remains" : "remain"} — we've updated your bag.`
            : `We can reserve up to ${config.maxQuantityPerLine} of ${describe(resolved)} per order — we've updated your bag.`,
      });
    }

    const unitPrice = variant.priceOverride ?? product.price;
    lines.push({
      variantId,
      productId: product.id,
      categoryId: product.categoryId,
      sku: variant.sku,
      productSlug: product.slug,
      name: product.name,
      href: productHref(product.slug),
      colorName: resolved.color.name,
      sizeLabel: resolved.size.label,
      image: image as MediaAsset,
      unitPrice,
      compareAtUnitPrice:
        product.compareAtPrice !== null && product.compareAtPrice > unitPrice ? product.compareAtPrice : null,
      quantity,
      lineTotal: unitPrice * quantity,
      available,
      stockStatus: stockStatus(variant.inventory),
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    currency: "NGN",
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal,
    freeDeliveryThreshold: config.freeDeliveryThreshold,
    amountToFreeDelivery: Math.max(0, config.freeDeliveryThreshold - subtotal),
    issues,
  };
}
