"use client";

import Link from "next/link";
import * as m from "motion/react-m";

import { MAX_LINE_QUANTITY, describeLine } from "@/components/cart/cart-lines";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import type { CartQuoteLine } from "@/lib/catalog/types";
import { DURATION, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface CartLineItemProps {
  /** Server-priced line from the latest quote. */
  line: CartQuoteLine;
  /** Local quantity, so the stepper responds instantly while a new quote is in flight. */
  quantity: number;
  /** Prices are from the previous quote and about to update. */
  pending?: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  /** Called when a product link is followed, to close the drawer. */
  onNavigate?: () => void;
}

/** One bag line: 4:5 thumbnail, name, colour and size, price, stepper and remove. */
export function CartLineItem({
  line,
  quantity,
  pending = false,
  onQuantityChange,
  onRemove,
  onNavigate,
}: CartLineItemProps) {
  const label = describeLine(line);
  const max = Math.max(1, Math.min(line.available, MAX_LINE_QUANTITY));

  return (
    <m.li
      className="overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE_EDITORIAL }}
    >
      <div className="flex gap-4 py-5">
        {/* Duplicate of the name link, hidden from assistive tech and the tab order. */}
        <Link href={line.href} onClick={onNavigate} tabIndex={-1} aria-hidden="true" className="w-24 shrink-0">
          <MediaImage image={line.image} sizes="96px" ratio="4/5" alt="" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-body-sm font-medium">
                <Link href={line.href} onClick={onNavigate} className="link-underline">
                  {line.name}
                </Link>
              </h3>
              <p className="mt-1 text-caption text-muted-foreground">
                {line.colorName} · {line.sizeLabel}
              </p>
            </div>

            <div className={cn("shrink-0 text-right transition-opacity duration-300", pending && "opacity-50")}>
              <Price
                amount={line.lineTotal}
                compareAt={line.quantity === 1 ? line.compareAtUnitPrice : null}
                className="text-body-sm"
              />
              {line.quantity > 1 ? (
                <p className="mt-1 text-caption text-muted-foreground">
                  <Price amount={line.unitPrice} compareAt={line.compareAtUnitPrice} /> each
                </p>
              ) : null}
            </div>
          </div>

          {line.stockStatus === "low_stock" ? (
            <p className="mt-2 text-caption text-accent-brand">Only {line.available} remaining</p>
          ) : null}

          <div className="mt-auto flex items-end justify-between gap-4 pt-4">
            <QuantityStepper value={quantity} max={max} label={label} onChange={onQuantityChange} />
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex min-h-11 items-center text-caption text-muted-foreground transition-colors duration-300 hover:text-foreground"
            >
              <span className="link-underline-static pb-0.5">Remove</span>
              <span className="sr-only"> {label}</span>
            </button>
          </div>
        </div>
      </div>
    </m.li>
  );
}
