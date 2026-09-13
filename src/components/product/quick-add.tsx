"use client";

import * as React from "react";

import { useCart } from "@/components/cart/cart-provider";
import { PlusIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import type { ProductCardData, QuickAddOption } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

import { QuickAddSheet } from "./quick-add-sheet";
import { SoldOutStrike } from "./sold-out-strike";

export interface QuickAddProps {
  product: ProductCardData;
  option: QuickAddOption;
}

/** Hidden until the card is hovered or holds keyboard focus, then rises from the image edge. */
const barReveal = [
  "pointer-events-none translate-y-4 opacity-0",
  "transition-[opacity,translate] duration-500 ease-editorial",
  "group-hover/card:pointer-events-auto group-hover/card:translate-y-0 group-hover/card:opacity-100",
  "group-has-[:focus-visible]/card:pointer-events-auto group-has-[:focus-visible]/card:translate-y-0",
  "group-has-[:focus-visible]/card:opacity-100",
].join(" ");

/**
 * Quick add, one affordance per input type (only one is ever displayed):
 * - hover devices: a size bar that rises from the bottom of the image;
 * - touch devices: a "+" that opens a size sheet (or adds directly for one-size pieces).
 * Adding opens the cart drawer, which is the confirmation.
 */
export function QuickAdd({ product, option }: QuickAddProps) {
  const { addItem } = useCart();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // The sheet mounts on first use so a grid of cards doesn't carry idle dialogs.
  const [sheetMounted, setSheetMounted] = React.useState(false);

  if (!option.sizes.some((size) => size.available)) return null;

  const single = option.sizes.length === 1 ? option.sizes[0] : null;
  const openSheet = () => {
    setSheetMounted(true);
    setSheetOpen(true);
  };

  return (
    <>
      {/* Hover devices */}
      <div
        role="group"
        aria-label={`Quick add ${product.name}, ${option.colorName}`}
        className={cn(
          "absolute inset-x-0 bottom-0 hidden bg-paper text-ink [@media(hover:hover)]:block",
          barReveal,
        )}
      >
        {single ? (
          <button
            type="button"
            onClick={() => addItem(single.variantId)}
            className="flex h-11 w-full items-center justify-center text-label transition-colors duration-300 ease-editorial hover:bg-ink hover:text-paper focus-visible:-outline-offset-[1.5px]"
          >
            Add to bag
          </button>
        ) : (
          <>
            <p aria-hidden="true" className="flex items-baseline justify-between gap-3 px-3 pt-2.5">
              <span className="text-eyebrow">Quick add</span>
              <span className="truncate text-caption text-stone">{option.colorName}</span>
            </p>
            <ul className="flex flex-wrap px-1.5 pt-1 pb-1.5">
              {option.sizes.map((size) => (
                <li key={size.variantId} className="min-w-8 flex-1">
                  <button
                    type="button"
                    aria-disabled={size.available ? undefined : true}
                    onClick={size.available ? () => addItem(size.variantId) : undefined}
                    className={cn(
                      "relative flex h-9 w-full items-center justify-center text-caption font-medium tabular-nums",
                      "transition-colors duration-300 ease-editorial focus-visible:-outline-offset-[1.5px]",
                      size.available ? "hover:bg-ink hover:text-paper" : "cursor-default text-stone",
                    )}
                  >
                    <span className="sr-only">Size </span>
                    {size.label}
                    {size.available ? null : (
                      <>
                        <span className="sr-only">, sold out</span>
                        <SoldOutStrike className="opacity-50" />
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Touch devices */}
      <IconButton
        label={single ? `Add ${product.name} to bag` : `Quick add ${product.name}`}
        aria-haspopup={single ? undefined : "dialog"}
        onClick={single ? () => addItem(single.variantId) : openSheet}
        className="pointer-events-auto absolute right-0 bottom-0 text-ink focus-visible:-outline-offset-[11.5px] [@media(hover:hover)]:hidden"
      >
        <span className="grid size-6 place-items-center bg-paper/90 text-[0.875rem]">
          <PlusIcon />
        </span>
      </IconButton>

      {sheetMounted && !single ? (
        <QuickAddSheet product={product} option={option} open={sheetOpen} onOpenChange={setSheetOpen} />
      ) : null}
    </>
  );
}
