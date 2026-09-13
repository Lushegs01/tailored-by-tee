/**
 * Categories, in navigation order. Images are attached by the store from the
 * media manifest (`category:<slug>`), so this file stays pure data.
 */
export interface CategorySeed {
  slug: string;
  name: string;
  description: string;
  /** Three-letter code used in SKUs. */
  code: string;
}

export const CATEGORY_SEEDS = [
  {
    slug: "shirts",
    name: "Shirts",
    description: "Washed linen, crisp poplin and sand-washed silk, cut to stay cool through a Lagos afternoon.",
    code: "SHR",
  },
  {
    slug: "trousers",
    name: "Trousers",
    description: "Straight, pleated and drawstring shapes in cloth that holds its line from morning to evening.",
    code: "TRS",
  },
  {
    slug: "outerwear",
    name: "Outerwear",
    description: "Overshirts, jackets and light coats that layer easily over everything else.",
    code: "OTW",
  },
  {
    slug: "knitwear",
    name: "Knitwear",
    description: "Cotton and merino knits, fine enough for warm evenings and air-conditioned rooms.",
    code: "KNT",
  },
  {
    slug: "tailoring",
    name: "Tailoring",
    description: "Half-canvassed and unstructured pieces in tropical wool and linen, made for the heat.",
    code: "TLR",
  },
  {
    slug: "t-shirts",
    name: "T-Shirts",
    description: "Heavyweight, slub and pima jersey in the shapes we return to every season.",
    code: "TEE",
  },
  {
    slug: "denim",
    name: "Denim",
    description: "Rigid Japanese selvedge and workwear cuts that soften and fade with every wear.",
    code: "DNM",
  },
  {
    slug: "accessories",
    name: "Accessories",
    description: "Vegetable-tanned leather and washed cotton, made to finish an outfit quietly.",
    code: "ACC",
  },
] as const satisfies readonly CategorySeed[];

export type CategorySlug = (typeof CATEGORY_SEEDS)[number]["slug"];
