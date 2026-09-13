"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import type { Kobo } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

export interface CartFooterProps {
  /** Null until the first quote resolves. */
  subtotal: Kobo | null;
  /** Subtotal is from the previous quote and about to update. */
  pending?: boolean;
  /** False while the bag is being re-priced, failed to price, or is empty. */
  canCheckout: boolean;
  onNavigate: () => void;
}

/** Pinned drawer footer: subtotal, the one filled button, and a way back out. */
export function CartFooter({ subtotal, pending = false, canCheckout, onNavigate }: CartFooterProps) {
  return (
    <div className="px-6 pb-5 pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-label">Subtotal</span>
        {subtotal === null ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <Price
            amount={subtotal}
            className={cn("text-body transition-opacity duration-300", pending && "opacity-50")}
          />
        )}
      </div>
      <p className="mt-1.5 text-caption text-muted-foreground">Delivery and duties calculated at checkout.</p>

      <Button asChild size="lg" fullWidth arrow className="mt-5">
        <Link
          href="/checkout"
          aria-disabled={canCheckout ? undefined : true}
          onClick={(event) => {
            if (!canCheckout) {
              event.preventDefault();
              return;
            }
            onNavigate();
          }}
        >
          Checkout
        </Link>
      </Button>

      <div className="mt-1 flex justify-center">
        <button type="button" onClick={onNavigate} className="inline-flex min-h-11 items-center text-label">
          <span className="link-underline pb-1">Continue shopping</span>
        </button>
      </div>
    </div>
  );
}
