import type { Kobo, ProductBadge, ProductStatus } from "../types";
import type { CategorySlug } from "./categories";
import type { CollectionSlug } from "./collections";
import type { ColorId } from "./colors";
import type { SizeId } from "./sizes";

/**
 * The hand-authored shape of a product. The mapper expands it into a full
 * `Product` — variants, SKUs, seeded inventory and photography.
 */
export interface ProductSeed {
  slug: string;
  /** Three-letter code used in SKUs; unique across the catalogue. */
  code: string;
  name: string;
  category: CategorySlug;
  collections: CollectionSlug[];
  summary: string;
  description: string;
  details: string[];
  material: string;
  care: readonly string[];
  fit: string | null;
  modelNote: string | null;
  price: Kobo;
  compareAtPrice?: Kobo;
  badge?: ProductBadge;
  isFeatured?: boolean;
  bestsellerRank?: number;
  tags: string[];
  /** Display order. The first colour is the one photographed. */
  colors: ColorId[];
  sizes: SizeId[];
  createdAt: string;
  updatedAt?: string;
  status?: ProductStatus;
  /** Deliberate stock states, so sold-out UI can be exercised. */
  stock?: { soldOut?: boolean; soldOutColors?: ColorId[] };
}
