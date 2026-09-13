import { cn } from "@/lib/utils";

/*
 * Layout constants shared by the card, grid, carousel and skeletons, so loading
 * states and responsive image hints never drift from the real layout.
 */

export type ProductGridColumns = 3 | 4;

/** Default `sizes` for a card in a 2 / 3 / 4-up grid. */
export const PRODUCT_CARD_SIZES = "(min-width: 1280px) 23vw, (min-width: 768px) 31vw, 48vw";

/** 2-up on phones, 3-up from md, 4-up from lg when `columns` is 4. */
export function productGridClassName(columns: ProductGridColumns) {
  return cn(
    "grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-5 md:gap-y-14",
    columns === 4 && "lg:grid-cols-4",
  );
}

/** Image hints per grid layout, capped once the page container reaches its max width. */
export function productGridSizes(columns: ProductGridColumns) {
  return columns === 4
    ? "(min-width: 1920px) 420px, (min-width: 1024px) 23vw, (min-width: 768px) 31vw, 48vw"
    : "(min-width: 1920px) 560px, (min-width: 768px) 31vw, 48vw";
}

/**
 * Card chrome that waits for intent: on hover-capable devices it stays hidden until
 * the card is hovered or holds keyboard focus; on touch it is always present.
 * The reveal classes repeat the media query on purpose — stacked variants sort
 * after the single one, so the reveal reliably overrides the hide.
 */
export const revealOnIntent = [
  "transition-opacity duration-500 ease-editorial",
  "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0",
  "[@media(hover:hover)]:group-hover/card:pointer-events-auto [@media(hover:hover)]:group-hover/card:opacity-100",
  "[@media(hover:hover)]:group-has-[:focus-visible]/card:pointer-events-auto",
  "[@media(hover:hover)]:group-has-[:focus-visible]/card:opacity-100",
].join(" ");
