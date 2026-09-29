import "server-only";

import { revalidateTag, updateTag } from "next/cache";

import { CATALOG_CACHE_TAG } from "@/lib/catalog/sources/database";

/*
 * Keeping the storefront in step with admin edits.
 *
 * The storefront reads its catalogue from one cached snapshot tagged "catalog"
 * (lib/catalog/sources/database.ts, refreshed on its own every 5 minutes). The
 * snapshot holds: categories; published collections and their images; every
 * product with its fields, status, prices, colours, sizes, collection links,
 * images and variants — including each variant's stock counts, which listings
 * use to show "sold out"; the colour and size registries. Stock that decides
 * whether something can actually be bought is always read live, never from here.
 *
 * The prerendered and ISR pages built from the snapshot — the homepage, /shop,
 * /collections, /product/[slug] and the rest — carry the same tag (see
 * x-next-cache-tags in .next/server/app/**.meta), so expiring the tag expires
 * those pages too; no revalidatePath is needed for them. New product and
 * collection pages render on demand.
 *
 * Next 16 has two ways to expire a tag:
 * - updateTag(tag): server actions only. Expires immediately; the next request
 *   waits for fresh data (read-your-own-writes). This is what an admin expects:
 *   save a price, open the product page, see the new price. It also re-renders
 *   the admin page the action was called from.
 * - revalidateTag(tag, profile): server actions and route handlers. With "max"
 *   it serves stale content while refreshing; with { expire: 0 } it expires
 *   immediately. Used from route handlers, where updateTag is not allowed.
 */

/**
 * Call at the end of any admin server action that changes something in the
 * snapshot (see above) — product fields, status, prices, images, variants,
 * categories, collections, featured flags, colours, sizes, and stock changes
 * (adjustments, and cancellations or refunds that put pieces back) — after the
 * transaction has committed. Server actions only (throws elsewhere): use
 * refreshStorefrontCatalogFromRoute in a route handler.
 */
export function refreshStorefrontCatalog(): void {
  updateTag(CATALOG_CACHE_TAG);
}

/** The route-handler equivalent: expires the catalogue immediately, with no stale window. */
export function refreshStorefrontCatalogFromRoute(): void {
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
}
