import type { StatusTone } from "@/lib/admin/status";

/*
 * What the owner reads about collections, in one place: how a collection shows in
 * the shop, and what "featured" does there. Pure (server pages, client forms and
 * tests share it). The rules mirror the storefront:
 * - only published collections are in the shop at all (lib/catalog/sources/database.ts);
 * - the Collections page leaves out collections with no listed pieces, and lists
 *   featured ones first, then the rest in your order (app/collections/page.tsx);
 * - the Shop menu's large photo is the first featured collection in your order,
 *   or the first collection when none is featured (layout/header/nav-data.ts);
 * - a piece is listed when it is Live and has at least one photo (lib/catalog/repository.ts).
 */

export interface VisibilityDisplay {
  label: string;
  tone: StatusTone;
  description: string;
}

export function pieces(count: number): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? "piece" : "pieces"}`;
}

/** How a collection shows in the shop right now. `liveCount`: its Live pieces that have photos. */
export function collectionVisibility({
  isPublished,
  liveCount,
}: {
  isPublished: boolean;
  liveCount: number;
}): VisibilityDisplay {
  if (!isPublished) {
    return {
      label: "Hidden",
      tone: "neutral",
      description: "Not shown in the shop. Its pieces are still on sale as usual.",
    };
  }
  if (liveCount === 0) {
    return {
      label: "No live pieces",
      tone: "attention",
      description:
        "Published, but none of its pieces are live with photos yet, so it’s left off the Collections page.",
    };
  }
  return {
    label: "In the shop",
    tone: "positive",
    description: `On the Collections page with ${pieces(liveCount)}.`,
  };
}

export const LIVE_PIECE_HINT = "A piece shows in the shop when it is Live and has at least one photo.";

export const FEATURED_HINT =
  "Featured collections come first on the Collections page. The first featured one in your order is also the large photo in the Shop menu (with none featured, the first collection is used). You can feature more than one.";

export const PUBLISHED_HINT =
  "Hidden collections have no page in the shop and don’t appear in menus or filters. Their pieces stay on sale.";

export const HERO_HINT =
  "The large photo at the top of the collection’s page, also used on its card on the Collections page and in the menu. Without one, the first campaign photo below is used instead. It’s cropped to an upright frame on phones and nearly square on computers, so keep the subject near the centre.";

export const PRODUCT_ORDER_HINT =
  "This order is saved with the collection. The shop’s collection page currently arranges pieces itself — featured pieces first, then best sellers, then the newest — and shoppers can re-sort.";

export const PHOTOS_HINT =
  "Campaign photos for the collection’s page: the first two that aren’t the large photo are shown there, so the order matters. The rest are spares, and the Shop menu may use one when its shape suits the space better.";

/** Deleting removes the grouping only. */
export function deleteCollectionExplanation(name: string, productCount: number): string {
  return productCount > 0
    ? `This removes the collection “${name}” and its page. Its ${pieces(productCount)} stay in the shop and keep their stock; its photos stay in the library.`
    : `This removes the collection “${name}” and its page. Its photos stay in the library.`;
}
