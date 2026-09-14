"use client";

import * as React from "react";

import { MediaImage } from "@/components/ui/media-image";
import type { MediaAsset } from "@/lib/media/types";
import { cn } from "@/lib/utils";

export interface ProductGalleryProps {
  images: MediaAsset[];
  productName: string;
  className?: string;
}

/**
 * One set of images, two behaviours: a swipeable, snap-scrolling strip on phones
 * and a tall stack beside the sticky details from md. Rendering the images once
 * means the first photograph is preloaded once, at the right size.
 */
export function ProductGallery({ images, productName, className }: ProductGalleryProps) {
  const trackRef = React.useRef<HTMLUListElement>(null);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (track.clientWidth > 0) setIndex(Math.round(track.scrollLeft / track.clientWidth));
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (images.length === 0) return <div aria-hidden="true" className={cn("aspect-4/5 bg-surface", className)} />;

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={trackRef}
        aria-label={`${productName} photographs`}
        // `relative` so positioned descendants are clipped by the scroller, never widening the page.
        className="relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none md:grid md:snap-none md:gap-2 md:overflow-visible"
      >
        {images.map((image, position) => (
          <li
            key={image.src}
            aria-label={`${position + 1} of ${images.length}`}
            className="w-full shrink-0 snap-start md:w-auto"
          >
            <MediaImage
              image={image}
              ratio="4/5"
              quality={85}
              preload={position === 0}
              sizes="(min-width: 1920px) 1060px, (min-width: 1024px) 56vw, (min-width: 768px) 48vw, 100vw"
            />
          </li>
        ))}
      </ul>

      {images.length > 1 ? (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute right-(--gutter) bottom-3 bg-paper/90 px-2 py-1 text-micro tabular-nums text-ink md:hidden"
        >
          {index + 1} / {images.length}
        </p>
      ) : null}
    </div>
  );
}
