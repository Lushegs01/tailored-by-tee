import type { InventoryLevel, ProductVariant, StockStatus } from "./types";

/*
 * Stock rules shared by listings, product pages and the cart quote.
 * Pure (no server-only imports) so it can be unit-tested directly.
 */

/** Units that can actually be sold: on hand minus those held by open checkouts. */
export function availableUnits(inventory: InventoryLevel): number {
  return Math.max(0, inventory.onHand - inventory.reserved);
}

export function isPurchasable(variant: ProductVariant): boolean {
  return variant.isActive && availableUnits(variant.inventory) > 0;
}

export function stockStatus(inventory: InventoryLevel): StockStatus {
  const available = availableUnits(inventory);
  if (available <= 0) return "out_of_stock";
  if (available <= inventory.lowStockThreshold) return "low_stock";
  return "in_stock";
}

/* ── Deterministic seed stock ───────────────────────────────────────────── */

/** 32-bit FNV-1a — stable across runtimes, so seeded stock never shifts between reloads. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedInventoryOptions {
  lowStockThreshold: number;
  /** Smallest and largest sizes carry roughly half the stock of the core run. */
  isEdgeSize?: boolean;
}

/**
 * Stock for one SKU, derived from a hash of the SKU itself: roughly 8% sold out,
 * 14% low (1–3), the rest 4–20, with an occasional unit reserved by a checkout.
 */
export function seedInventory(sku: string, options: SeedInventoryOptions): InventoryLevel {
  const random = seededRandom(hashString(sku));
  const roll = random();

  let onHand: number;
  if (roll < 0.08) onHand = 0;
  else if (roll < 0.22) onHand = 1 + Math.floor(random() * 3);
  else onHand = 4 + Math.floor(random() * 17);

  if (options.isEdgeSize && onHand > 6) onHand = Math.ceil(onHand / 2);

  const reserved = onHand >= 2 && random() < 0.07 ? 1 : 0;

  return { onHand, reserved, lowStockThreshold: options.lowStockThreshold };
}
