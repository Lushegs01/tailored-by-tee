import Image from "next/image";

import type { MediaAsset } from "@/lib/media/types";
import { cn } from "@/lib/utils";

export interface MediaImageProps {
  image: MediaAsset;
  /** Always pass a real `sizes` value — it decides which file the browser downloads. */
  sizes: string;
  /**
   * CSS aspect-ratio for the frame, e.g. "4/5". Defaults to the asset's own ratio.
   * Pass `null` when the parent controls the height (e.g. a full-viewport hero).
   */
  ratio?: string | null;
  /** Preload + high fetch priority. Use for the LCP image only. */
  preload?: boolean;
  quality?: 60 | 75 | 85;
  alt?: string;
  /** CSS object-position, e.g. "50% 30%". */
  position?: string;
  className?: string;
  imageClassName?: string;
}

/**
 * The only way photography enters the UI. Guarantees a fixed frame (no layout
 * shift), a dominant-colour ground and a blur placeholder, so pages feel composed
 * before a single image has arrived.
 */
export function MediaImage({
  image,
  sizes,
  ratio,
  preload = false,
  quality = 75,
  alt,
  position,
  className,
  imageClassName,
}: MediaImageProps) {
  const aspectRatio = ratio === null ? undefined : (ratio ?? `${image.width} / ${image.height}`);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundColor: image.color, aspectRatio }}
    >
      <Image
        src={image.src}
        alt={alt ?? image.alt}
        fill
        sizes={sizes}
        quality={quality}
        preload={preload}
        fetchPriority={preload ? "high" : undefined}
        placeholder={image.blurDataURL ? "blur" : "empty"}
        blurDataURL={image.blurDataURL}
        className={cn("object-cover", imageClassName)}
        style={position ? { objectPosition: position } : undefined}
      />
    </div>
  );
}
