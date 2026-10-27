import { BOTTOM_SEEDS } from "./products-bottoms";
import { LAYER_SEEDS } from "./products-layers";
import { TOP_SEEDS } from "./products-tops";
import { TRADITIONAL_SEEDS } from "./products-traditional";
import type { ProductSeed } from "./types";

export type { ProductSeed } from "./types";

/**
 * The full seed catalogue — 59 pieces. Authoring order is irrelevant; listings
 * sort by the rules in `query.ts`.
 */
export const PRODUCT_SEEDS: readonly ProductSeed[] = [
  ...TOP_SEEDS,
  ...BOTTOM_SEEDS,
  ...LAYER_SEEDS,
  ...TRADITIONAL_SEEDS,
];
