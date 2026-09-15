"use client";

import * as React from "react";
import Link from "next/link";

import { getWishlistProducts, type WishlistProduct, type WishlistProductsResult } from "@/app/wishlist/actions";
import { useAccount } from "@/components/account/use-account";
import { MAX_CART_LINES } from "@/components/cart/cart-lines";
import { useCart } from "@/components/cart/cart-provider";
import { EmptyState } from "@/components/feedback/empty-state";
import { useHasMounted } from "@/components/hooks/use-has-mounted";
import { productGridClassName, productGridSizes } from "@/components/product/product-layout";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/text-link";
import { useWishlist, useWishlistStatus } from "@/components/wishlist/wishlist-provider";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { WishlistItem } from "./wishlist-item";
import { WishlistItemSkeleton, WishlistSkeleton } from "./wishlist-skeleton";

const GRID_SIZES = productGridSizes(4);

type Notice = { kind: "moved"; name: string } | { kind: "returned"; name: string } | { kind: "bag-full" };

export interface WishlistViewProps {
  className?: string;
  /**
   * Where a guest signs in to keep the list on their account (signInPath("/wishlist"),
   * built by the server page because lib/auth/session is server-only). Null when no
   * sign-in method is switched on, so the invitation isn't offered.
   */
  signInHref: string | null;
}

/**
 * The saved pieces. Resolved in the browser: a guest's list lives in
 * localStorage, so the server can't know it. The list — order, saves, removals —
 * always comes from the wishlist provider; card data comes from the public
 * catalogue, kept per id so removing one piece never reloads the others.
 *
 * Announcements come from the providers themselves (the bag says what was
 * added, the wishlist what was removed); the notices here are for sighted
 * shoppers and are deliberately not live regions, so nothing is read twice.
 */
export function WishlistView({ className, signInHref }: WishlistViewProps) {
  const wishlist = useWishlist();
  const { restoring, forget } = useWishlistStatus();
  const account = useAccount();
  const cart = useCart();
  const mounted = useHasMounted();
  const headingId = React.useId();

  const [resolved, setResolved] = React.useState<ReadonlyMap<string, WishlistProduct>>(() => new Map());
  /** Ids the catalogue no longer lists; they are dropped from the list too. */
  const [unlisted, setUnlisted] = React.useState<ReadonlySet<string>>(() => new Set());
  const [failedKey, setFailedKey] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const regionRef = React.useRef<HTMLElement>(null);
  /** Pieces just moved to the bag, until its quote confirms them: variant id → product. */
  const movedRef = React.useRef(new Map<string, { productId: string; name: string }>());

  const ids = wishlist.productIds.filter((id) => !unlisted.has(id));
  const unresolved = ids.filter((id) => !resolved.has(id));
  const requestKey = unresolved.length > 0 ? JSON.stringify(unresolved) : null;
  const failed = requestKey !== null && failedKey === requestKey;
  const loading = requestKey !== null && !failed;

  const applyResult = React.useEffectEvent((requested: string[], result: WishlistProductsResult, key: string) => {
    if (!result.ok) {
      setFailedKey(key);
      return;
    }
    setResolved((current) => {
      const next = new Map(current);
      for (const item of result.products) next.set(item.product.id, item);
      return next;
    });
    const found = new Set(result.products.map((item) => item.product.id));
    const gone = requested.filter((id) => !found.has(id));
    if (gone.length > 0) {
      // Withdrawn from the shop since it was saved: drop it rather than show a gap.
      setUnlisted((current) => new Set([...current, ...gone]));
      forget(gone);
    }
  });

  React.useEffect(() => {
    if (!mounted || requestKey === null) return;
    const requested = JSON.parse(requestKey) as string[];
    // Results are merged by id, so an answer that arrives late or out of order is still right.
    getWishlistProducts(requested).then(
      (result) => applyResult(requested, result, requestKey),
      () => applyResult(requested, { ok: false, message: "" }, requestKey),
    );
  }, [mounted, requestKey, attempt]);

  const reconcileMoves = React.useEffectEvent(() => {
    for (const [variantId, entry] of movedRef.current) {
      const refused = cart.notices?.some(
        (issue) => issue.variantId === variantId && issue.kind !== "quantity_reduced",
      );
      if (refused) {
        // Sold out before the bag could take it: keep it saved rather than lose it.
        movedRef.current.delete(variantId);
        wishlist.add(entry.productId);
        setNotice({ kind: "returned", name: entry.name });
      } else if (cart.status === "idle" && cart.quote?.lines.some((line) => line.variantId === variantId)) {
        movedRef.current.delete(variantId);
      }
    }
  });

  React.useEffect(() => {
    reconcileMoves();
  }, [cart.quote, cart.notices, cart.status]);

  /** After a piece leaves the grid, keep keyboard and screen-reader users in the list rather than at the top of the page. */
  const focusRegion = () => requestAnimationFrame(() => regionRef.current?.focus());

  const retry = () => {
    setFailedKey(null);
    setAttempt((value) => value + 1);
  };

  function moveToBag(item: WishlistProduct, variantId: string) {
    const { product, bag } = item;
    const size = bag?.sizes.find((option) => option.variantId === variantId);
    if (!bag || !size) return;

    const alreadyInBag = cart.lines.some((line) => line.variantId === variantId);
    const bagFull = !alreadyInBag && cart.lines.length >= MAX_CART_LINES;
    const label = [product.name, bag.colorName, bag.oneSize ? null : size.label].filter(Boolean).join(", ");
    // The bag decides, and announces, what happens — including why a full bag can't take it.
    cart.addItem(variantId, 1, { label, openDrawer: false });
    if (bagFull) {
      setNotice({ kind: "bag-full" });
      return;
    }

    if (!alreadyInBag) movedRef.current.set(variantId, { productId: product.id, name: product.name });
    wishlist.remove(product.id);
    setNotice({ kind: "moved", name: product.name });
    focusRegion();
  }

  function removeSaved(item: WishlistProduct) {
    wishlist.remove(item.product.id);
    setNotice(null);
    focusRegion();
  }

  if (!mounted || restoring) return <WishlistSkeleton className={className} />;

  const signInLine =
    account.status === "signed-out" && signInHref !== null ? <SignInLine href={signInHref} /> : null;
  const items = ids.flatMap((id) => resolved.get(id) ?? []);

  if (ids.length === 0) {
    return (
      <section
        ref={regionRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className={cn("outline-none", className)}
      >
        {notice ? <WishlistNotice notice={notice} className="mb-10" /> : null}
        <EmptyState
          id={headingId}
          align="start"
          title="Nothing *saved* yet."
          body="Use the heart on any piece to keep it here for later."
          actions={
            <Button asChild arrow>
              <Link href="/shop">Browse the shop</Link>
            </Button>
          }
        >
          {signInLine}
        </EmptyState>
      </section>
    );
  }

  if (failed && items.length === 0) {
    return (
      <section
        ref={regionRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className={cn("outline-none", className)}
      >
        <div role="alert">
          <EmptyState
            id={headingId}
            align="start"
            title="We couldn’t load your *saved pieces.*"
            body="Your wishlist is safe — this is only a problem showing it. Please try again in a moment."
            actions={<Button onClick={retry}>Try again</Button>}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cn("outline-none", className)}
    >
      <h2 id={headingId} className="sr-only">
        Saved pieces
      </h2>
      <div className="flex flex-col gap-x-8 gap-y-3 border-b pb-4 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-caption tabular-nums text-muted-foreground">{pluralize(ids.length, "piece")}</p>
        {signInLine}
      </div>

      {notice ? <WishlistNotice notice={notice} className="mt-6" /> : null}

      {failed ? (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border border-danger/40 px-4 py-3 text-body-sm"
        >
          <p>Some saved pieces didn’t load.</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center text-label transition-opacity duration-300 hover:opacity-60"
          >
            <span className="link-underline-static pb-1">Try again</span>
          </button>
        </div>
      ) : null}

      <ul aria-busy={loading || undefined} className={cn(productGridClassName(4), "mt-8")}>
        {ids.map((id, index) => {
          const item = resolved.get(id);
          if (item) {
            return (
              <WishlistItem
                key={id}
                item={item}
                sizes={GRID_SIZES}
                preload={index < 2}
                onMove={(variantId) => moveToBag(item, variantId)}
                onRemove={() => removeSaved(item)}
              />
            );
          }
          return failed ? null : (
            <li key={id}>
              <span className="sr-only">Loading</span>
              <WishlistItemSkeleton />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SignInLine({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="self-start text-body-sm text-muted-foreground transition-colors duration-300 ease-editorial hover:text-foreground"
    >
      <span className="link-underline-static pb-0.5">Sign in to keep your saved pieces across devices</span>
    </Link>
  );
}

function WishlistNotice({ notice, className }: { notice: Notice; className?: string }) {
  const text =
    notice.kind === "moved"
      ? `${notice.name} is now in your bag.`
      : notice.kind === "returned"
        ? `${notice.name} sold out in that size before it reached your bag, so it’s back in your wishlist.`
        : `Your bag holds up to ${MAX_CART_LINES} different pieces. Make room there to move this one across.`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border px-4 py-3 text-body-sm",
        className,
      )}
    >
      <p className="min-w-0">{text}</p>
      {notice.kind === "returned" ? null : (
        <TextLink href="/cart" variant="underline" className="min-h-11">
          View bag
        </TextLink>
      )}
    </div>
  );
}
