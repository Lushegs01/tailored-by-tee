import Image from "next/image";

import { isOptimizableImageUrl } from "@/lib/admin/image-probe";
import { cn } from "@/lib/utils";

export interface MediaThumbProps {
  media: { url: string; alt: string; color: string };
  /** Real `sizes` for the thumbnail's rendered width, e.g. "6rem". */
  sizes: string;
  /**
   * The image's alt. Defaults to the photo's own description; pass "" when the
   * description is already shown or read next to the thumbnail.
   */
  alt?: string;
  /** "cover" crops to the frame as the shop does (default); "contain" shows the whole photo. */
  fit?: "cover" | "contain";
  className?: string;
}

/**
 * A photo in the storefront's fixed 4:5 product frame, on its own ground colour,
 * so the admin sees the crop customers will see. Server-compatible. Addresses
 * next/image can't optimise (none should exist) are shown as they are rather than
 * breaking the page.
 */
export function MediaThumb({ media, sizes, alt, fit = "cover", className }: MediaThumbProps) {
  return (
    <div
      className={cn("relative aspect-4/5 overflow-hidden", className)}
      style={{ backgroundColor: media.color }}
    >
      <Image
        src={media.url}
        alt={alt ?? media.alt}
        fill
        sizes={sizes}
        quality={60}
        unoptimized={!isOptimizableImageUrl(media.url)}
        className={fit === "cover" ? "object-cover" : "object-contain"}
      />
    </div>
  );
}
