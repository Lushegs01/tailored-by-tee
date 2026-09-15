"use server";

import { z } from "zod";

import { addWishlistItem, mergeWishlist, removeWishlistItem } from "@/lib/account/wishlist";
import { getCurrentUser } from "@/lib/auth/session";
import { availableUnits } from "@/lib/catalog/inventory";
import { getProductsByIds } from "@/lib/catalog/repository";
import { loadLiveInventory } from "@/lib/catalog/sources";
import type { InventoryLevel, ProductCardData } from "@/lib/catalog/types";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * The wishlist's server actions. Like every server action they are public POST
 * endpoints: each one rate-limits, re-validates its whole input and returns a
 * typed result rather than throwing. Changes to an account's list take the user
 * from the session, never from the request.
 */

const productIdSchema = z.string().min(1).max(64);
const productIdsSchema = z.array(productIdSchema).max(100);

/* ── The account's list ────────────────────────────────────────────────── */

export type WishlistSyncResult =
  | { ok: true; /** The account's whole list, newest first. */ productIds: string[] }
  | { ok: false; reason: "signed-out" | "error" };

/**
 * Merges the ids saved in this browser (newest first) into the signed-in
 * account and returns the account's list. Pass [] to just read it.
 */
export async function syncWishlist(localIds: unknown): Promise<WishlistSyncResult> {
  if (!rateLimit(`wishlist-sync:${await clientAddress()}`, { limit: 60, windowMs: 60_000 }).ok) {
    return { ok: false, reason: "error" };
  }
  const parsed = productIdsSchema.safeParse(localIds);
  if (!parsed.success) return { ok: false, reason: "error" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed-out" };
  if (!rateLimit(`wishlist-sync-user:${user.id}`, { limit: 20, windowMs: 60_000 }).ok) {
    return { ok: false, reason: "error" };
  }

  try {
    return { ok: true, productIds: await mergeWishlist(user.id, parsed.data) };
  } catch (error) {
    console.error("[wishlist] sync failed", error);
    return { ok: false, reason: "error" };
  }
}

export async function addToWishlist(productId: unknown): Promise<WishlistSyncResult> {
  return changeWishlist(productId, addWishlistItem);
}

export async function removeFromWishlist(productId: unknown): Promise<WishlistSyncResult> {
  return changeWishlist(productId, removeWishlistItem);
}

async function changeWishlist(
  productId: unknown,
  change: (userId: string, productId: string) => Promise<string[]>,
): Promise<WishlistSyncResult> {
  if (!rateLimit(`wishlist-write:${await clientAddress()}`, { limit: 240, windowMs: 60_000 }).ok) {
    return { ok: false, reason: "error" };
  }
  const parsed = productIdSchema.safeParse(productId);
  if (!parsed.success) return { ok: false, reason: "error" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed-out" };
  if (!rateLimit(`wishlist-write-user:${user.id}`, { limit: 60, windowMs: 60_000 }).ok) {
    return { ok: false, reason: "error" };
  }

  try {
    return { ok: true, productIds: await change(user.id, parsed.data) };
  } catch (error) {
    console.error("[wishlist] update failed", error);
    return { ok: false, reason: "error" };
  }
}

/* ── Cards for the wishlist page (public catalogue data; guests too) ──── */

export interface WishlistBagOption {
  colorName: string;
  /** The piece is made in a single size, so there is nothing to choose. */
  oneSize: boolean;
  /** Sizes in stock right now, in size order. */
  sizes: { variantId: string; label: string }[];
}

export interface WishlistProduct {
  product: ProductCardData;
  /** Moving it to the bag: the default colour's in-stock sizes. Null when none can be bought. */
  bag: WishlistBagOption | null;
}

export type WishlistProductsResult = { ok: true; products: WishlistProduct[] } | { ok: false; message: string };

/** Card data for up to 100 product ids, in the order given. Ids the catalogue doesn't list are left out. */
export async function getWishlistProducts(ids: unknown): Promise<WishlistProductsResult> {
  if (!rateLimit(`wishlist-read:${await clientAddress()}`, { limit: 120, windowMs: 60_000 }).ok) {
    return { ok: false, message: "Too many requests at once. Please wait a moment and try again." };
  }
  const parsed = productIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: "We couldn’t read your wishlist. Please refresh the page." };

  try {
    const cards = await getProductsByIds([...new Set(parsed.data)]);
    // Sizes come from the cached catalogue, but whether they can be bought is read
    // live, so "Move to bag" never offers a size that has just sold out.
    const live = await loadLiveInventory(
      cards.flatMap((card) => card.quickAdd?.sizes.map((size) => size.variantId) ?? []),
    );
    return { ok: true, products: cards.map((card) => ({ product: card, bag: bagOption(card, live) })) };
  } catch (error) {
    console.error("[wishlist] could not load products", error);
    return { ok: false, message: "We couldn’t load your saved pieces just now. Please try again." };
  }
}

function bagOption(card: ProductCardData, live: Map<string, InventoryLevel> | null): WishlistBagOption | null {
  const option = card.quickAdd;
  if (!option) return null;

  const sizes = option.sizes
    .filter((size) => {
      const level = live?.get(size.variantId);
      return level ? availableUnits(level) > 0 : size.available;
    })
    .map(({ variantId, label }) => ({ variantId, label }));
  if (sizes.length === 0) return null;

  return { colorName: option.colorName, oneSize: option.sizes.length === 1, sizes };
}
