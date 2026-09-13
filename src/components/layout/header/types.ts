import type { MediaAsset } from "@/lib/media/types";

/*
 * Lean, serialisable navigation data. The server header maps catalogue records to
 * these shapes so client components receive names, hrefs and counts — never the
 * full catalogue.
 */

export interface NavCategory {
  slug: string;
  name: string;
  href: string;
  productCount: number;
}

export interface NavCollection {
  slug: string;
  name: string;
  href: string;
  /** e.g. "Collection 04" */
  code: string | null;
  /** e.g. "Harmattan 2026" */
  season: string | null;
  summary: string;
  image: MediaAsset | null;
}

export interface HeaderNavData {
  categories: NavCategory[];
  collections: NavCollection[];
  /** Shown as the editorial card in the Shop panel; its image prefers the wide hero. */
  featured: NavCollection | null;
}
