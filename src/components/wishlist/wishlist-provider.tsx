"use client";

import * as React from "react";

import { LiveRegion, useAnnouncer } from "@/components/cart/live-region";
import { createStoredValue } from "@/lib/storage";

/*
 * Guest wishlist: product ids in localStorage, newest first, synced across tabs.
 * Phase 6 adds server persistence for signed-in clients, merging this list into
 * the account on sign-in; the context contract stays the same.
 */

export interface WishlistContextValue {
  /** Newest first. Empty on the server and during hydration. */
  productIds: string[];
  count: number;
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
  add: (productId: string) => void;
  remove: (productId: string) => void;
}

const STORAGE_KEY = "tbt.wishlist.v1";
const MAX_WISHLIST_ITEMS = 100;
const MAX_ID_LENGTH = 64;

function isProductId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** Keeps only well-formed, unique ids from untrusted storage. */
function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isProductId))].slice(0, MAX_WISHLIST_ITEMS);
}

const wishlistStore = createStoredValue<string[]>(STORAGE_KEY, { fallback: [], parse: sanitizeIds });

const WishlistContext = React.createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const productIds = React.useSyncExternalStore(
    wishlistStore.subscribe,
    wishlistStore.get,
    wishlistStore.getServer,
  );
  const { message, announce } = useAnnouncer();

  const add = React.useCallback(
    (productId: string) => {
      const current = wishlistStore.get();
      if (!isProductId(productId) || current.includes(productId)) return;
      // At capacity the oldest save makes way, so the newest action always succeeds.
      wishlistStore.set([productId, ...current].slice(0, MAX_WISHLIST_ITEMS));
      announce("Saved to your wishlist");
    },
    [announce],
  );

  const remove = React.useCallback(
    (productId: string) => {
      const current = wishlistStore.get();
      if (!current.includes(productId)) return;
      wishlistStore.set(current.filter((id) => id !== productId));
      announce("Removed from your wishlist");
    },
    [announce],
  );

  const toggle = React.useCallback(
    (productId: string) => (wishlistStore.get().includes(productId) ? remove(productId) : add(productId)),
    [add, remove],
  );

  const value = React.useMemo<WishlistContextValue>(() => {
    const saved = new Set(productIds);
    return {
      productIds,
      count: productIds.length,
      has: (productId) => saved.has(productId),
      toggle,
      add,
      remove,
    };
  }, [productIds, toggle, add, remove]);

  return (
    <WishlistContext value={value}>
      {children}
      <LiveRegion message={message} />
    </WishlistContext>
  );
}

export function useWishlist() {
  const context = React.useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within <WishlistProvider>");
  return context;
}
