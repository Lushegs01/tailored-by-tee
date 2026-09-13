"use client";

import * as React from "react";

import { useCart } from "@/components/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { TextLink } from "@/components/ui/text-link";
import type { ProductCardData, QuickAddOption } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

import { SoldOutStrike } from "./sold-out-strike";

export interface QuickAddSheetProps {
  product: ProductCardData;
  option: QuickAddOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Touch quick add: a bottom sheet with the piece, its colour and a size grid.
 * Sizes are native radios (arrow keys, form semantics and "dimmed" sold-out sizes
 * for free), styled as 48px squares. The chosen size is remembered between opens.
 */
export function QuickAddSheet({ product, option, open, onOpenChange }: QuickAddSheetProps) {
  const { addItem } = useCart();
  const [variantId, setVariantId] = React.useState<string | null>(null);
  const formId = React.useId();
  const groupName = React.useId();

  const selected = option.sizes.find((size) => size.variantId === variantId && size.available) ?? null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    onOpenChange(false);
    addItem(selected.variantId);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Select a size"
      footer={
        <div className="mx-auto max-w-lg px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="submit" form={formId} fullWidth disabled={!selected}>
            Add to bag
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="mx-auto max-w-lg px-6 py-6">
        <div className="flex gap-4">
          <MediaImage image={product.image} sizes="64px" ratio="4/5" quality={60} className="w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium">{product.name}</p>
            <Price amount={product.price} compareAt={product.compareAtPrice} className="text-body-sm" />
            <p className="mt-2 text-caption text-muted-foreground">Colour: {option.colorName}</p>
          </div>
        </div>

        <fieldset className="mt-7">
          <legend className="mb-3 text-eyebrow text-muted-foreground">Size</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
            {option.sizes.map((size) => (
              <label
                key={size.variantId}
                className={cn(
                  "relative flex h-12 items-center justify-center border text-body-sm tabular-nums",
                  "transition-colors duration-300 ease-editorial",
                  "has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background",
                  "has-[:focus-visible]:outline-[1.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
                  size.available
                    ? "cursor-pointer border-border-strong hover:border-foreground"
                    : "cursor-default border-border text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={size.variantId}
                  checked={variantId === size.variantId}
                  disabled={!size.available}
                  onChange={() => setVariantId(size.variantId)}
                  className="sr-only"
                />
                {size.label}
                {size.available ? null : (
                  <>
                    <span className="sr-only">, sold out</span>
                    <SoldOutStrike className="opacity-40" />
                  </>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <TextLink href={product.href} onClick={() => onOpenChange(false)} className="mt-7">
          View piece
        </TextLink>
      </form>
    </Sheet>
  );
}
