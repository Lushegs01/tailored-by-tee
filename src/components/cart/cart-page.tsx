"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartError, CartNotices } from "@/components/cart/cart-notices";
import { useCart } from "@/components/cart/cart-provider";
import { CartLineSkeleton } from "@/components/cart/cart-skeleton";
import { FreeDeliveryProgress } from "@/components/cart/free-delivery-progress";
import { EmptyState } from "@/components/feedback/empty-state";
import { useHasMounted } from "@/components/hooks/use-has-mounted";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import { TextLink } from "@/components/ui/text-link";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import type { CartQuoteLine } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The bag as a full page — the same state and server quote as the drawer, with
 * room to review before checkout. Renders after mount: the bag lives in
 * localStorage, so the server can't know what's in it.
 */
export function CartPageView({ className }: { className?: string }) {
  const cart = useCart();
  const mounted = useHasMounted();
  const { count: wishlistCount } = useWishlist();
  const listRef = React.useRef<HTMLUListElement>(null);

  if (!mounted) return <CartPageSkeleton className={className} />;

  const { lines, quote, status, itemCount } = cart;
  const pending = status === "loading";
  const priced = new Map<string, CartQuoteLine>(quote?.lines.map((line) => [line.variantId, line]) ?? []);

  if (lines.length === 0) {
    return (
      <EmptyState
        align="start"
        className={className}
        title="Your bag is *empty.*"
        body="Pieces you add will be kept here, on this device."
        actions={
          <>
            <Button asChild arrow>
              <Link href="/shop/new-arrivals">Shop new arrivals</Link>
            </Button>
            <TextLink href="/collections">Explore collections</TextLink>
            {wishlistCount > 0 ? <TextLink href="/wishlist">Your wishlist ({wishlistCount})</TextLink> : null}
          </>
        }
      />
    );
  }

  return (
    <div className={cn("lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16", className)}>
      <div className="lg:col-span-7">
        <p className="mb-4 text-caption tabular-nums text-muted-foreground">{pluralize(itemCount, "piece")}</p>
        <CartNotices notices={cart.notices ?? []} onDismiss={cart.dismissNotices} className="mb-6" />
        {status === "error" ? <CartError onRetry={cart.refresh} className="mb-6" /> : null}

        <h2 className="sr-only">Pieces in your bag</h2>
        <ul
          ref={listRef}
          tabIndex={-1}
          aria-busy={pending || undefined}
          className="border-y outline-none [&>li+li]:border-t"
        >
          <AnimatePresence initial={false}>
            {lines.map((line) => {
              const data = priced.get(line.variantId);
              return data ? (
                <CartLineItem
                  key={line.variantId}
                  line={data}
                  quantity={line.quantity}
                  pending={pending}
                  onQuantityChange={(quantity) => cart.updateQuantity(line.variantId, quantity)}
                  onRemove={() => {
                    cart.removeItem(line.variantId);
                    requestAnimationFrame(() => listRef.current?.focus());
                  }}
                />
              ) : (
                <CartLineSkeleton key={line.variantId} />
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

      <aside aria-labelledby="bag-summary-heading" className="mt-12 lg:col-span-5 lg:mt-0">
        <div className="lg:sticky lg:top-[calc(var(--header-height)+2rem)]">
          <h2 id="bag-summary-heading" className="border-t pt-6 text-label">
            Summary
          </h2>

          {quote && quote.freeDeliveryThreshold > 0 ? (
            <FreeDeliveryProgress
              subtotal={quote.subtotal}
              threshold={quote.freeDeliveryThreshold}
              remaining={quote.amountToFreeDelivery}
              pending={pending}
              className="px-0"
            />
          ) : null}

          <div className="flex items-baseline justify-between gap-4 pt-5">
            <span className="text-body-sm text-muted-foreground">Subtotal</span>
            {quote ? (
              <Price amount={quote.subtotal} className={cn("text-lead transition-opacity", pending && "opacity-50")} />
            ) : (
              <Skeleton className="h-4 w-24" />
            )}
          </div>
          <p className="mt-2 text-caption text-muted-foreground">Delivery and any discount are worked out at checkout.</p>

          <Button asChild size="lg" fullWidth arrow className="mt-6">
            <Link
              href="/checkout"
              aria-disabled={status === "idle" ? undefined : true}
              onClick={(event) => {
                if (status !== "idle") event.preventDefault();
              }}
            >
              Checkout
            </Link>
          </Button>
          <p className="mt-4 text-caption text-muted-foreground">
            Secure payment with Paystack: card, bank transfer or USSD.
          </p>
        </div>
      </aside>
    </div>
  );
}

function CartPageSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("lg:grid lg:grid-cols-12 lg:gap-x-12", className)}>
      <span className="sr-only">Loading your bag</span>
      <div aria-hidden="true" className="space-y-6 lg:col-span-7">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <div aria-hidden="true" className="mt-12 space-y-4 lg:col-span-5 lg:mt-0">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
