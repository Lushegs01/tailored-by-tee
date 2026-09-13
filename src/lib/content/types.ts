import type { MediaKey } from "@/lib/media/types";
import type { NavLink } from "@/config/site";

/**
 * Homepage content blocks.
 *
 * The homepage is an ordered list of these blocks, so sections can be reordered,
 * removed or repeated without touching components. Text fields support *emphasis*
 * (rendered as italic serif). In Phase 8 this array is stored in the database and
 * edited from the admin.
 */

export type ProductSource =
  | { kind: "newArrivals" }
  | { kind: "bestsellers" }
  | { kind: "collection"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "handpicked"; slugs: string[] };

export interface HeroBlock {
  type: "hero";
  eyebrow: string;
  headline: string;
  body: string;
  primaryCta: NavLink;
  secondaryCta?: NavLink;
  image: MediaKey;
  mobileImage?: MediaKey;
  /** Campaign-style credit linking to the pictured piece. */
  caption?: NavLink;
}

export interface StatementBlock {
  type: "statement";
  eyebrow: string;
  text: string;
  link?: NavLink;
}

export interface ProductShelfBlock {
  type: "productShelf";
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  source: ProductSource;
  limit: number;
  layout: "grid" | "carousel";
  cta?: NavLink;
}

export interface SplitStoryBlock {
  type: "splitStory";
  eyebrow: string;
  title: string;
  body: string;
  image: MediaKey;
  imageSide: "left" | "right";
  /** Optional numbered list of links, e.g. the essential pieces. */
  items?: NavLink[];
  cta?: NavLink;
}

export interface CategoryIndexBlock {
  type: "categoryIndex";
  eyebrow: string;
  title: string;
  /** Category slugs, in display order. */
  categories: string[];
}

export interface CollectionSpreadBlock {
  type: "collectionSpread";
  collectionSlug: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: NavLink;
  /** [lead, supporting, detail] */
  images: [MediaKey, MediaKey, MediaKey];
  theme: "paper" | "ink";
}

export interface BrandStoryBlock {
  type: "brandStory";
  eyebrow: string;
  title: string;
  body: string;
  principles: { title: string; body: string }[];
  image: MediaKey;
  detailImage?: MediaKey;
  cta?: NavLink;
}

export interface NewsletterBlock {
  type: "newsletter";
  eyebrow: string;
  title: string;
  body: string;
  image?: MediaKey;
}

export type HomeBlock =
  | HeroBlock
  | StatementBlock
  | ProductShelfBlock
  | SplitStoryBlock
  | CategoryIndexBlock
  | CollectionSpreadBlock
  | BrandStoryBlock
  | NewsletterBlock;
