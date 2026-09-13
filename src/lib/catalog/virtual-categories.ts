/**
 * Listing pages that behave like categories but are derived from product data
 * (/shop/new-arrivals, /shop/sale). `listProducts({ category })` accepts these
 * slugs; `getCategoryBySlug` does not, so pages should check here first.
 * Safe to import from client components.
 */
export const NEW_ARRIVALS_LIMIT = 12;

export const VIRTUAL_CATEGORIES = {
  "new-arrivals": {
    slug: "new-arrivals",
    name: "New Arrivals",
    description: "The most recent pieces from the studio, newest first.",
  },
  sale: {
    slug: "sale",
    name: "Sale",
    description: "A small edit of reduced pieces, while sizes remain.",
  },
} as const;

export type VirtualCategorySlug = keyof typeof VIRTUAL_CATEGORIES;
export type VirtualCategory = (typeof VIRTUAL_CATEGORIES)[VirtualCategorySlug];

export function isVirtualCategory(slug: string): slug is VirtualCategorySlug {
  return Object.hasOwn(VIRTUAL_CATEGORIES, slug);
}
