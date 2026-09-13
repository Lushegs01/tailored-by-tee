import { siteConfig } from "@/config/site";
import type { CartIssue, CartLineInput, CartQuote, CartQuoteLine } from "@/lib/catalog/types";

/*
 * Pure helpers for the client-held cart lines. The quote route imports the same
 * limits, so the browser and the server always agree on what a valid bag is.
 */

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = siteConfig.commerce.maxQuantityPerLine;
/** Variant ids are short opaque strings; anything longer did not come from us. */
export const MAX_VARIANT_ID_LENGTH = 64;

/** Shown for an empty bag without a round trip; totals are trivially zero. */
export const EMPTY_QUOTE: CartQuote = {
  currency: "NGN",
  lines: [],
  itemCount: 0,
  subtotal: 0,
  freeDeliveryThreshold: siteConfig.commerce.freeDeliveryThreshold,
  amountToFreeDelivery: siteConfig.commerce.freeDeliveryThreshold,
  issues: [],
};

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(quantity)));
}

/** Rebuilds lines from untrusted storage: drops malformed entries, merges duplicates, clamps. */
export function sanitizeLines(value: unknown): CartLineInput[] {
  if (!Array.isArray(value)) return [];

  const lines: CartLineInput[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { variantId, quantity } = entry as Record<string, unknown>;
    if (typeof variantId !== "string" || variantId.length === 0) continue;
    if (variantId.length > MAX_VARIANT_ID_LENGTH) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) continue;

    const existing = lines.find((line) => line.variantId === variantId);
    if (existing) existing.quantity = clampQuantity(existing.quantity + quantity);
    else if (lines.length < MAX_CART_LINES) lines.push({ variantId, quantity: clampQuantity(quantity) });
  }
  return lines;
}

export function countItems(lines: CartLineInput[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Stable identity for a set of lines, used to match a quote to the lines it priced. */
export function linesKey(lines: CartLineInput[]): string {
  return JSON.stringify(lines);
}

/**
 * Applies the server's corrections to every line the quote flagged: reduced
 * quantities are adopted, missing or unavailable variants are dropped. Unflagged
 * lines keep their identity, and the original array is returned when nothing changed.
 */
export function reconcileLines(lines: CartLineInput[], quote: CartQuote): CartLineInput[] {
  if (quote.issues.length === 0) return lines;

  const flagged = new Set(quote.issues.map((issue) => issue.variantId));
  const quoted = new Map(quote.lines.map((line) => [line.variantId, line.quantity]));
  let changed = false;

  const next = lines.flatMap((line) => {
    if (!flagged.has(line.variantId)) return [line];
    const quantity = quoted.get(line.variantId) ?? 0;
    if (quantity < 1) {
      changed = true;
      return [];
    }
    if (quantity === line.quantity) return [line];
    changed = true;
    return [{ ...line, quantity: clampQuantity(quantity) }];
  });

  return changed ? next : lines;
}

/** Latest issue per variant wins, so a repeated correction replaces the earlier message. */
export function mergeIssues(current: CartIssue[], incoming: CartIssue[]): CartIssue[] {
  const byVariant = new Map(current.map((issue) => [issue.variantId, issue]));
  for (const issue of incoming) byVariant.set(issue.variantId, issue);
  return [...byVariant.values()];
}

/** "Structured Overshirt, Clay, M": the phrase used in announcements and labels. */
export function describeLine(line: Pick<CartQuoteLine, "name" | "colorName" | "sizeLabel">): string {
  return [line.name, line.colorName, line.sizeLabel].filter(Boolean).join(", ");
}
