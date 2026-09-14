import type { Kobo, ProductSort, SizeSystem } from "@/lib/catalog/types";

/**
 * Listing configuration: the /shop page copy, the sort vocabulary, price filter
 * bands and how size systems are labelled in filters. Plain data, safe on client
 * and server; change it here rather than in components.
 */

export interface SortOption {
  value: ProductSort;
  label: string;
}

/** A price filter band in kobo: `min` inclusive, `max` exclusive; null leaves that side open. */
export interface PriceBand {
  id: string;
  min: Kobo | null;
  max: Kobo | null;
}

export interface ShopConfig {
  title: string;
  description: string;
  /** Pieces per listing page. */
  pageSize: number;
  sortOptions: SortOption[];
  priceBands: PriceBand[];
  sizeGroupLabels: Record<SizeSystem, string>;
}

export const shopConfig = {
  title: "All pieces",
  description:
    "Everything currently in the studio — shirts and tailoring, knitwear and denim, and the accessories that finish them.",
  pageSize: 24,
  sortOptions: [
    { value: "featured", label: "Featured" },
    { value: "newest", label: "Newest" },
    { value: "price-asc", label: "Price, low to high" },
    { value: "price-desc", label: "Price, high to low" },
  ],
  priceBands: [
    { id: "under-40000", min: null, max: 40_000_00 },
    { id: "40000-80000", min: 40_000_00, max: 80_000_00 },
    { id: "80000-150000", min: 80_000_00, max: 150_000_00 },
    { id: "over-150000", min: 150_000_00, max: null },
  ],
  sizeGroupLabels: {
    apparel: "Clothing",
    waist: "Waist",
    belt: "Belt",
    "one-size": "One size",
  },
} satisfies ShopConfig;
