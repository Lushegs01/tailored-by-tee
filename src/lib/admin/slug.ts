import { SLUG_MAX, slugify, suggestFreeSlug } from "@/components/admin/collections/slug-rules";

/*
 * Web addresses ("slugs") for products: /product/<slug>.
 *
 * The rules are the shop's, not this page's: slugify and suggestFreeSlug are the
 * same functions collections and categories use, so one piece named "Harmattan
 * ’26 — Clay & Tobacco" becomes the same address wherever it is created. This
 * module adds only what is particular to products: the storefront path, the
 * wording of a problem, and picking a free address for a new piece.
 *
 * Pure (no server or browser APIs): the forms preview the address as the owner
 * types and the server applies exactly the same rules before saving.
 */

export { slugify };

/** Longest product slug kept, shared with collections and categories. */
export const PRODUCT_SLUG_MAX = SLUG_MAX;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The storefront address of a product: "/product/linen-camp-shirt". */
export function productStorefrontPath(slug: string): string {
  return `/product/${slug}`;
}

/** The prefix shown before the address field. */
export const PRODUCT_SLUG_PREFIX = "/product/";

/**
 * Why a product's web address can't be used, in a sentence for the owner, or null
 * when it can. Expects an address that has already been through slugify.
 */
export function productSlugProblem(slug: string): string | null {
  if (slug === "") return "Enter a web address using letters or numbers.";
  if (slug.length > PRODUCT_SLUG_MAX) return `The web address must be ${PRODUCT_SLUG_MAX} characters or fewer.`;
  if (!SLUG_PATTERN.test(slug)) return "Use lower-case letters, numbers and hyphens only.";
  return null;
}

/**
 * The first free "<base>-2", "<base>-3"… given the addresses already taken — for
 * "try this instead" when an address is in use.
 */
export function nextFreeProductSlug(base: string, taken: Iterable<string>): string {
  return suggestFreeSlug(base, taken);
}

/**
 * A free address for a new piece, made from its name: "Linen Camp Shirt" →
 * "linen-camp-shirt", or "linen-camp-shirt-2" when that one is taken. Returns ""
 * when the name has no letters or numbers to work with (the owner then types one).
 */
export function suggestProductSlug(name: string, taken: Iterable<string>): string {
  const base = slugify(name);
  if (base === "") return "";
  return suggestFreeSlug(base, taken);
}
