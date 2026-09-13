import type { MediaKey } from "@/lib/media/types";

/**
 * Collections, in display order. Imagery is referenced by media key and resolved
 * by the store; a missing key simply resolves to no image.
 */
export interface CollectionSeed {
  slug: string;
  name: string;
  code: string | null;
  season: string | null;
  summary: string;
  description: string;
  heroImageKey: MediaKey | null;
  imageKeys: MediaKey[];
  isFeatured: boolean;
}

export const COLLECTION_SEEDS = [
  {
    slug: "harmattan-26",
    name: "Harmattan",
    code: "Collection 04",
    season: "Harmattan 2026",
    summary: "Dry-season layers in clay, tobacco, olive and sand.",
    description:
      "When the harmattan settles over Lagos, the mornings turn hazy and the evenings cool. Collection 04 answers with layers — brushed twill, fine merino, tropical wool and soft suede — in the colours of dry earth and dust-softened light. Each piece is light enough for midday and warm enough for the hours after dark.",
    heroImageKey: "editorial:collectionMain",
    imageKeys: ["editorial:collectionMain", "editorial:collectionSecondaryA", "editorial:collectionSecondaryB"],
    isFeatured: true,
  },
  {
    slug: "studio-essentials",
    name: "Studio Essentials",
    code: null,
    season: null,
    summary: "Year-round foundations, cut to be worn on repeat.",
    description:
      "The pieces that stay in the studio whatever the season: heavyweight tees, crisp poplin, straight trousers, rigid denim and a light chore coat. Each was drafted once and refined over several seasons, and is restocked rather than replaced.",
    heroImageKey: "editorial:essentials",
    imageKeys: ["editorial:essentials"],
    isFeatured: false,
  },
  {
    slug: "coastline",
    name: "Coastline",
    code: "Collection 03",
    season: "Hot Season 2026",
    summary: "Linen and light cottons for the hottest months.",
    description:
      "Made for the months when the heat sits heavy on the city — washed linen, sand-washed silk and open cotton knits in pale, sun-faded tones. Loose where it should be, cool against the skin, and meant to be worn creased.",
    heroImageKey: "category:shirts",
    imageKeys: ["category:shirts"],
    isFeatured: false,
  },
] as const satisfies readonly CollectionSeed[];

export type CollectionSlug = (typeof COLLECTION_SEEDS)[number]["slug"];
