import type { Category, Collection, Color, Product, Size } from "../types";

/**
 * Everything the storefront reads about the catalogue, in domain shape. Both
 * sources — the typed seed catalogue and the database — produce this, so the
 * listing, facet, search and pricing logic runs unchanged on either.
 *
 * Plain JSON-safe data (dates are ISO strings), so it can be cached.
 */
export interface CatalogSnapshot {
  /** Identifies this load; derived indexes are rebuilt only when it changes. */
  version: string;
  categories: Category[];
  collections: Collection[];
  /** Every product in any status, with or without photography; the store decides what is listed. */
  products: Product[];
  colors: Color[];
  sizes: Size[];
}

export type CatalogSource = "seed" | "database";
