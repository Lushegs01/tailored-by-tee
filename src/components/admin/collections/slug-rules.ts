import { isVirtualCategory, VIRTUAL_CATEGORIES } from "@/lib/catalog/virtual-categories";

/*
 * Web addresses ("slugs") for collections and categories: /collections/<slug>
 * and /shop/<slug>. Pure, so the forms can preview the address as the owner
 * types and the server applies exactly the same rules before saving.
 */

/** Longest slug kept. Long enough for "harmattan-2026-capsule-in-clay-and-tobacco". */
export const SLUG_MAX = 80;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * "Harmattan ’26 — Clay & Tobacco" → "harmattan-26-clay-and-tobacco".
 * Accents are dropped (é → e), "&" becomes "and", everything else that isn't a
 * letter or digit becomes a single hyphen. Cut at a word boundary under SLUG_MAX.
 */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= SLUG_MAX) return base;
  const cut = base.slice(0, SLUG_MAX + 1);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : base.slice(0, SLUG_MAX)).replace(/-+$/, "");
}

export type SlugKind = "collection" | "category";

/** The storefront path for a slug: "/collections/harmattan-26" or "/shop/shirts". */
export function storefrontPath(kind: SlugKind, slug: string): string {
  return kind === "collection" ? `/collections/${slug}` : `/shop/${slug}`;
}

/** The path prefix shown before the slug field. */
export function storefrontPrefix(kind: SlugKind): string {
  return kind === "collection" ? "/collections/" : "/shop/";
}

/**
 * Why a slug can't be used, in a sentence for the owner, or null when it can.
 * Expects a slug that has already been through slugify.
 */
export function slugProblem(slug: string, kind: SlugKind): string | null {
  if (slug === "") return "Enter a web address using letters or numbers.";
  if (slug.length > SLUG_MAX) return `The web address must be ${SLUG_MAX} characters or fewer.`;
  if (!SLUG_PATTERN.test(slug)) return "Use lower-case letters, numbers and hyphens only.";
  if (kind === "category" && isVirtualCategory(slug)) {
    return `“${slug}” is already used by the shop’s ${VIRTUAL_CATEGORIES[slug].name} page. Choose another web address.`;
  }
  return null;
}

/**
 * The first free "<base>-2", "<base>-3"… given the slugs already taken, for a
 * friendly "try this instead" when a slug is in use.
 */
export function suggestFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, SLUG_MAX - 9)}-${Date.now().toString(36).slice(-8)}`;
}
