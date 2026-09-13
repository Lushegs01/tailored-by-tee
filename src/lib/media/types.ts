/** A single image asset with everything needed to render it gracefully before it loads. */
export interface MediaAsset {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Dominant colour, painted behind the image while it loads. */
  color: string;
  /** Tiny base64 JPEG for next/image's blur placeholder. */
  blurDataURL?: string;
  credit?: { name: string; url: string; photoUrl?: string };
}

export interface ProductMediaEntry {
  name: string;
  garmentColorName: string;
  garmentColorHex: string;
  primary: MediaAsset;
  alternate: MediaAsset;
}

export interface MediaManifest {
  editorial: Record<string, MediaAsset>;
  categories: Record<string, MediaAsset>;
  products: Record<string, ProductMediaEntry>;
}

/** Content references media by key, e.g. "editorial:hero" or "category:shirts". */
export type MediaKey = `editorial:${string}` | `category:${string}`;
