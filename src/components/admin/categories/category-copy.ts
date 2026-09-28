import type { VisibilityDisplay } from "@/components/admin/collections/collection-copy";
import { pieces } from "@/components/admin/collections/collection-copy";

/*
 * What the owner reads about categories. Pure. The rules mirror the storefront:
 * every category has a page at /shop/<web address>, but the Shop menu and the
 * category links above listings leave out categories with no listed pieces
 * (layout/header/nav-data.ts); categories appear in your order everywhere.
 */

/** How a category shows in the shop right now. `liveCount`: its Live pieces that have photos. */
export function categoryVisibility(liveCount: number): VisibilityDisplay {
  if (liveCount === 0) {
    return {
      label: "Not in the menu",
      tone: "neutral",
      description: "No live pieces with photos yet, so it’s left out of the Shop menu.",
    };
  }
  return {
    label: "In the shop",
    tone: "positive",
    description: `In the Shop menu with ${pieces(liveCount)}.`,
  };
}

export const CATEGORY_ORDER_HINT = "The order of categories in the Shop menu and above product lists.";

export const CATEGORY_IMAGE_HINT =
  "Used in the homepage’s category list and when the category’s page is shared. An upright photo works best.";

export const CATEGORY_DESCRIPTION_HINT =
  "One or two sentences under the category’s name on its page, also used by search engines.";

export const CATEGORY_CODE_HINT =
  "Three letters that go into every SKU in this category, e.g. SHR for Shirts. Choose carefully: it can’t change once products here have colours and sizes.";

/** Why the code is locked, for the edit form. */
export function lockedCodeExplanation(code: string, variantCount: number): string {
  const skus = `${variantCount.toLocaleString("en-GB")} ${variantCount === 1 ? "SKU" : "SKUs"}`;
  return `Locked: ${skus} in this category already include ${code}. Changing it would break the SKUs on labels, orders and stock records.`;
}

/** Why a category can't be deleted yet, or null when it can. */
export function deleteCategoryBlocker(productCount: number, couponCodes: readonly string[]): string | null {
  if (productCount > 0) {
    return `It still has ${productCount === 1 ? "1 product" : `${productCount.toLocaleString("en-GB")} products`} (including drafts and archived ones). Move ${productCount === 1 ? "it" : "them"} to another category first.`;
  }
  if (couponCodes.length > 0) {
    const shown = couponCodes.slice(0, 5).join(", ");
    const more = couponCodes.length > 5 ? ` and ${couponCodes.length - 5} more` : "";
    const one = couponCodes.length === 1;
    return `${one ? "A discount is" : `${couponCodes.length} discounts are`} limited to this category (${shown}${more}). Remove the category from ${one ? "that discount" : "those discounts"} first: a discount limited only to this category would otherwise start applying to the whole shop.`;
  }
  return null;
}
