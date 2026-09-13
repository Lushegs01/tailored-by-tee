import "server-only";

import manifest from "@/data/media.json";
import type { MediaAsset, MediaKey, MediaManifest, ProductMediaEntry } from "./types";

export type { MediaAsset, MediaKey, MediaManifest, ProductMediaEntry } from "./types";

/**
 * Placeholder media manifest (Unsplash). In Phase 8 product imagery moves to
 * Cloudinary and editorial imagery becomes admin-managed content.
 */
const media = manifest as MediaManifest;

export function getMedia(key: MediaKey): MediaAsset | null {
  const [namespace, id] = key.split(":") as ["editorial" | "category", string];
  const bucket = namespace === "editorial" ? media.editorial : media.categories;
  return bucket[id] ?? null;
}

export function getProductMedia(slug: string): ProductMediaEntry | null {
  return media.products[slug] ?? null;
}

export function getAllProductMedia(): Record<string, ProductMediaEntry> {
  return media.products;
}
