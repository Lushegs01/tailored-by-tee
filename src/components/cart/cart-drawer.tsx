"use client";

import * as React from "react";
import { AnimatePresence } from "motion/react";

import { CartEmpty } from "@/components/cart/cart-empty";
import { CartFooter } from "@/components/cart/cart-footer";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartError, CartNotices } from "@/components/cart/cart-notices";
import { useCart } from "@/components/cart/cart-provider";
import { CartLineSkeleton } from "@/components/cart/cart-skeleton";
import { FreeDeliveryProgress } from "@/components/cart/free-delivery-progress";
import { Sheet } from "@/components/ui/sheet";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import type { CartQuoteLine } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";

/**
 * The mini bag. Row order and quantities follow local state so every action feels
 * immediate; names, images and prices come from the server quote and dim briefly
 * while a fresh one is on its way.
 */
export function CartDrawer() {
  const cart = useCart();
  const { count: wishlistCount } = useWishlist();
  const listRef = React.useRef<HTMLUListElement>(null);
  const emptyHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const { lines, quote, status, itemCount, close } = cart;
  const hasLines = lines.length > 0;
  const pending = status === "loading";
  const failedFirstQuote = status === "error" && quote === null;
  const priced = new Map<string, CartQuoteLine>(quote?.lines.map((line) => [line.variantId, line]) ?? []);

  function handleRemove(variantId: string) {
    const remaining = lines.length - 1;
    cart.removeItem(variantId);
    // The row (and the focused button) is leaving; keep focus inside the drawer.
    requestAnimationFrame(() => (remaining > 0 ? listRef.current : emptyHeadingRef.current)?.focus());
  }

  return (
    <Sheet
      open={cart.isOpen}
      onOpenChange={cart.setOpen}
      side="right"
      title="Your bag"
      headerAside={
        itemCount > 0 ? (
          <span className="text-caption tabular-nums text-muted-foreground">
            <span aria-hidden="true">{itemCount}</span>
            <span className="sr-only">{pluralize(itemCount, "item")}</span>
          </span>
        ) : null
      }
      footer={
        hasLines && !failedFirstQuote ? (
          <CartFooter
            subtotal={quote?.subtotal ?? null}
            pending={pending}
            canCheckout={status === "idle"}
            onNavigate={close}
          />
        ) : undefined
      }
      bodyClassName="flex flex-col"
    >
      {hasLines && quote && quote.freeDeliveryThreshold > 0 ? (
        <FreeDeliveryProgress
          subtotal={quote.subtotal}
          threshold={quote.freeDeliveryThreshold}
          remaining={quote.amountToFreeDelivery}
          pending={pending}
        />
      ) : null}

      <CartNotices notices={cart.notices ?? []} onDismiss={cart.dismissNotices} />
      {status === "error" ? <CartError onRetry={cart.refresh} /> : null}

      {hasLines ? (
        failedFirstQuote ? null : (
          <ul
            ref={listRef}
            tabIndex={-1}
            aria-label="Items in your bag"
            aria-busy={pending}
            className="px-6 pb-2 outline-none [&>li+li]:border-t"
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
                    onRemove={() => handleRemove(line.variantId)}
                    onNavigate={close}
                  />
                ) : (
                  <CartLineSkeleton key={line.variantId} />
                );
              })}
            </AnimatePresence>
          </ul>
        )
      ) : (
        <CartEmpty headingRef={emptyHeadingRef} wishlistCount={wishlistCount} onNavigate={close} />
      )}
    </Sheet>
  );
}
