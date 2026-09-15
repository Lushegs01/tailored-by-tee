import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";

/*
 * Signed-in wishlists. Every function takes the user id from the server session —
 * never one the browser sent — and scopes each query by it.
 *
 * Writes are idempotent (upsert, createMany with skipDuplicates, deleteMany), so a
 * double click, or two tabs merging the same guest list at once, can never
 * duplicate a row or fail on one. Only products a shopper can actually see are
 * stored; unknown, draft or archived ids are dropped without complaint.
 */

/** Matches the browser's cap. Beyond it the oldest saves make way for the newest. */
export const MAX_WISHLIST_ITEMS = 100;

/** Listed in the storefront: active and photographed — the catalogue shows nothing else. */
const visibleProduct = {
  status: "ACTIVE",
  images: { some: { role: "PRIMARY" } },
} satisfies Prisma.ProductWhereInput;

/** Newest first; the product id breaks ties so the order never wobbles. */
const newestFirst = [
  { addedAt: "desc" },
  { productId: "asc" },
] satisfies Prisma.WishlistItemOrderByWithRelationInput[];

/** The user's saved product ids, newest first. Products that have since been withdrawn are left out. */
export async function getWishlistProductIds(userId: string): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  const items = await getDb().wishlistItem.findMany({
    where: { wishlist: { userId }, product: visibleProduct },
    orderBy: newestFirst,
    take: MAX_WISHLIST_ITEMS,
    select: { productId: true },
  });
  return items.map((item) => item.productId);
}

export async function countWishlistItems(userId: string): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  return getDb().wishlistItem.count({ where: { wishlist: { userId }, product: visibleProduct } });
}

/** Saves one product (nothing happens if it is already saved or not listed). Returns the list, newest first. */
export async function addWishlistItem(userId: string, productId: string): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  await saveProducts(userId, [productId]);
  return getWishlistProductIds(userId);
}

/** Removes one product if saved. Returns the list, newest first. */
export async function removeWishlistItem(userId: string, productId: string): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  // Scoped through the wishlist's owner, so a guessed id can only ever touch this user's own list.
  await getDb().wishlistItem.deleteMany({ where: { productId, wishlist: { userId } } });
  return getWishlistProductIds(userId);
}

/**
 * Adds a guest's saved ids (newest first) that the account doesn't already hold,
 * then returns the whole list, newest first. Safe to repeat: merging the same
 * list twice changes nothing.
 */
export async function mergeWishlist(userId: string, productIds: string[]): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  await saveProducts(userId, productIds);
  return getWishlistProductIds(userId);
}

/** Stores the listed ones among `productIds` (newest first), keeping any already saved as they were. */
async function saveProducts(userId: string, productIds: readonly string[]): Promise<void> {
  const candidates = [...new Set(productIds)].slice(0, MAX_WISHLIST_ITEMS);
  if (candidates.length === 0) return;

  const db = getDb();
  const listed = await db.product.findMany({
    where: { id: { in: candidates }, ...visibleProduct },
    select: { id: true },
  });
  const listedIds = new Set(listed.map((product) => product.id));
  const incoming = candidates.filter((id) => listedIds.has(id));
  if (incoming.length === 0) return;

  const wishlistId = await ensureWishlist(userId);
  // A millisecond apart, new saves keep the order they arrived in and sit above
  // everything already saved; ids already there keep their original date.
  const now = Date.now();
  await db.wishlistItem.createMany({
    data: incoming.map((productId, index) => ({ wishlistId, productId, addedAt: new Date(now - index) })),
    skipDuplicates: true,
  });
  await trimToCap(wishlistId);
}

/** The user's wishlist row, created on first save. */
async function ensureWishlist(userId: string): Promise<string> {
  const db = getDb();
  try {
    const wishlist = await db.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return wishlist.id;
  } catch (error) {
    // Two first saves at once can race to create the row; the loser uses the winner's.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.wishlist.findUnique({ where: { userId }, select: { id: true } });
      if (existing) return existing.id;
    }
    throw error;
  }
}

/** Drops the oldest saves beyond the cap. Deleting by id is idempotent, so concurrent trims agree. */
async function trimToCap(wishlistId: string): Promise<void> {
  const db = getDb();
  const overflow = await db.wishlistItem.findMany({
    where: { wishlistId },
    orderBy: newestFirst,
    skip: MAX_WISHLIST_ITEMS,
    select: { productId: true },
  });
  if (overflow.length === 0) return;
  await db.wishlistItem.deleteMany({
    where: { wishlistId, productId: { in: overflow.map((item) => item.productId) } },
  });
}
