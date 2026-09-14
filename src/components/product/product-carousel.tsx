"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import type { ProductCardData } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

import { ProductCard } from "./product-card";

export interface ProductCarouselProps {
  products: ProductCardData[];
  /** Accessible name for the carousel region, e.g. "Most worn". */
  label: string;
  className?: string;
  /** Level for each product name; match the surrounding outline. */
  headingLevel?: "h2" | "h3" | "h4";
}

/** Slide widths: ≈70vw phones, 42vw md, 30vw lg, 23vw xl (capped at the container max). */
const SLIDE_SIZES =
  "(min-width: 1920px) 424px, (min-width: 1280px) 23vw, (min-width: 1024px) 30vw, (min-width: 768px) 42vw, 70vw";

/**
 * Lines the first slide up with the page grid (Container = centred max width + gutter)
 * while the track itself runs full-bleed, so the last slides travel to the viewport edge.
 */
const INSET = "max(var(--gutter), calc((100% - var(--container-max)) / 2 + var(--gutter)))";

interface TrackState {
  atStart: boolean;
  atEnd: boolean;
  scrollable: boolean;
}

/**
 * Native scroll-snap shelf: swipe, trackpad and keyboard scrolling come free.
 * Desktop adds prev/next controls (one slide per press); every size gets a 1px
 * progress rule whose ink thumb tracks the scroll position.
 * Render it outside <Container> — it is full-bleed by design.
 */
export function ProductCarousel({ products, label, className, headingLevel }: ProductCarouselProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLDivElement>(null);
  const trackId = React.useId();
  const reduceMotion = useReducedMotion();
  const [track, setTrack] = React.useState<TrackState>({ atStart: true, atEnd: false, scrollable: true });

  React.useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    let frame = 0;

    // Thumb geometry is written straight to the DOM; React state only changes at the edges.
    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = element;
      if (scrollWidth === 0 || clientWidth === 0) return;
      const maxScroll = scrollWidth - clientWidth;

      const thumb = thumbRef.current;
      if (thumb) {
        thumb.style.width = `${(clientWidth / scrollWidth) * 100}%`;
        thumb.style.transform = `translateX(${(scrollLeft / clientWidth) * 100}%)`;
        thumb.style.opacity = "1";
      }

      const next: TrackState = {
        atStart: scrollLeft <= 1,
        atEnd: scrollLeft >= maxScroll - 1,
        scrollable: maxScroll > 1,
      };
      setTrack((current) =>
        current.atStart === next.atStart && current.atEnd === next.atEnd && current.scrollable === next.scrollable
          ? current
          : next,
      );
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    element.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [products.length]);

  const scrollBySlide = (direction: 1 | -1) => {
    const element = trackRef.current;
    const slide = element?.firstElementChild;
    if (!element || !(slide instanceof HTMLElement)) return;

    const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    element.scrollBy({ left: direction * (slide.offsetWidth + gap), behavior: reduceMotion ? "auto" : "smooth" });
  };

  if (products.length === 0) return null;

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className={cn("w-full", className)}>
      <div
        ref={trackRef}
        id={trackId}
        // `relative`: the track must contain any absolutely positioned descendants so
        // they're clipped by its overflow instead of widening the document.
        className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scrollbar-none md:gap-5"
        style={{ paddingInline: INSET, scrollPaddingInline: INSET }}
      >
        {products.map((product, index) => (
          <div
            key={product.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${products.length}`}
            className="w-[70vw] shrink-0 snap-start md:w-[42vw] lg:w-[30vw] xl:w-[min(23vw,26.5rem)]"
          >
            <ProductCard product={product} sizes={SLIDE_SIZES} headingLevel={headingLevel} />
          </div>
        ))}
      </div>

      {/* Kept in flow (invisible) when nothing overflows, so the section never jumps. */}
      <div
        className={cn("mt-8 flex items-center gap-6 md:mt-10", !track.scrollable && "invisible")}
        style={{ paddingInline: INSET }}
      >
        <div aria-hidden="true" className="relative h-px flex-1 overflow-hidden bg-border">
          <div
            ref={thumbRef}
            className="absolute inset-y-0 left-0 w-1/4 bg-foreground opacity-0 transition-opacity duration-500 ease-editorial"
          />
        </div>
        {/* aria-disabled (not disabled) so focus isn't dropped when an end is reached. */}
        <div className="-mr-3 hidden items-center md:flex">
          <IconButton
            label="Previous pieces"
            aria-controls={trackId}
            aria-disabled={track.atStart}
            onClick={() => scrollBySlide(-1)}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-40"
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            label="Next pieces"
            aria-controls={trackId}
            aria-disabled={track.atEnd}
            onClick={() => scrollBySlide(1)}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-40"
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
