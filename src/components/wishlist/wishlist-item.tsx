"use client";

import * as React from "react";

import type { WishlistProduct } from "@/app/wishlist/actions";
import { ChevronDownIcon } from "@/components/icons";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/text-link";
import { cn } from "@/lib/utils";

export interface WishlistItemProps {
  item: WishlistProduct;
  /** next/image sizes for the card image. */
  sizes: string;
  preload?: boolean;
  onMove: (variantId: string) => void;
  onRemove: () => void;
}

/**
 * A saved piece: the storefront card — with its own quick add and heart switched
 * off, so each action appears once — and the two things a wishlist is for below
 * it. "Move to bag" uses the piece's default colour and offers only the sizes in
 * stock now; when there is just one, it is chosen already.
 */
export function WishlistItem({ item, sizes, preload = false, onMove, onRemove }: WishlistItemProps) {
  const { product, bag } = item;
  const ids = React.useId();
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const [choice, setChoice] = React.useState("");
  const [needsSize, setNeedsSize] = React.useState(false);

  const onlyOption = bag?.sizes.length === 1 ? bag.sizes[0] : null;
  const selected = bag?.sizes.find((size) => size.variantId === choice) ?? onlyOption;
  const showColour = product.colors.length > 1;
  const sizeFieldId = `${ids}-size`;
  const errorId = `${ids}-error`;

  function move() {
    if (!selected) {
      setNeedsSize(true);
      selectRef.current?.focus();
      return;
    }
    onMove(selected.variantId);
  }

  return (
    <li className="flex min-w-0 flex-col">
      <ProductCard
        product={product}
        sizes={sizes}
        preload={preload}
        headingLevel="h3"
        showQuickAdd={false}
        showWishlist={false}
      />

      <div className="mt-4 flex flex-col gap-2">
        {bag ? (
          <>
            {bag.oneSize ? (
              <p className="flex min-h-10 items-center text-caption text-muted-foreground">
                {showColour ? `${bag.colorName}, one size` : "One size"}
              </p>
            ) : (
              <div>
                <label htmlFor={sizeFieldId} className="sr-only">
                  Size{showColour ? ` in ${bag.colorName}` : ""} for {product.name}
                </label>
                <div className="relative">
                  <select
                    ref={selectRef}
                    id={sizeFieldId}
                    value={selected?.variantId ?? ""}
                    onChange={(event) => {
                      setChoice(event.target.value);
                      setNeedsSize(false);
                    }}
                    aria-invalid={needsSize || undefined}
                    aria-describedby={needsSize ? errorId : undefined}
                    className={cn(
                      "h-10 w-full min-w-0 cursor-pointer appearance-none truncate border border-input bg-transparent pr-9 pl-3 text-body-sm",
                      "transition-[border-color,box-shadow] duration-300 ease-editorial",
                      "focus-visible:border-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--foreground)] focus-visible:outline-none",
                      "aria-invalid:border-danger",
                      selected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <option value="" disabled>
                      Select size
                    </option>
                    {bag.sizes.map((size) => (
                      <option key={size.variantId} value={size.variantId} className="text-foreground">
                        {size.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base"
                  />
                </div>
                {showColour ? (
                  <p className="mt-1.5 text-caption text-muted-foreground">In {bag.colorName}</p>
                ) : null}
                {needsSize ? (
                  <p id={errorId} role="alert" className="mt-1.5 text-caption text-danger">
                    Select a size first.
                  </p>
                ) : null}
              </div>
            )}
            <Button variant="outline" size="sm" fullWidth onClick={move} className="mt-1 px-3">
              Move to bag<span className="sr-only">: {product.name}</span>
            </Button>
          </>
        ) : product.isSoldOut ? (
          <p className="flex min-h-10 items-center text-caption text-muted-foreground">Sold out for now.</p>
        ) : (
          <div className="flex min-h-10 flex-col justify-center gap-2">
            <p className="text-caption text-muted-foreground">This colour has just sold out.</p>
            <TextLink href={product.href} variant="underline" className="self-start">
              View piece<span className="sr-only">: {product.name}</span>
            </TextLink>
          </div>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-11 items-center self-start text-caption text-muted-foreground transition-colors duration-300 ease-editorial hover:text-foreground"
        >
          <span className="link-underline-static pb-0.5">Remove</span>
          <span className="sr-only"> {product.name} from your wishlist</span>
        </button>
      </div>
    </li>
  );
}
