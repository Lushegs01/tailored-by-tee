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
  /**
   * Further views of the same piece — a second colourway, a flat of the cloth —
   * shown after the first two on the product page. Cards only ever use the first
   * two, so this stays optional and costs listings nothing.
   */
  gallery?: MediaAsset[];
}

export interface MediaManifest {
  editorial: Record<string, MediaAsset>;
  categories: Record<string, MediaAsset>;
  products: Record<string, ProductMediaEntry>;
}

/** Content references media by key, e.g. "editorial:hero" or "category:shirts". */
export type MediaKey = `editorial:${string}` | `category:${string}`;
