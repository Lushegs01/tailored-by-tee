/*
 * The words the product pages use, in one place — so the owner's vocabulary can
 * be changed without hunting through components. Plain British English, no
 * jargon: "web address" rather than "slug", "Live" rather than "active".
 *
 * No hooks and no imports, so server and client components can both read them.
 */

/* ── The list ───────────────────────────────────────────────────────────── */

export const PRODUCTS_INTRO =
  "Everything the studio sells. A piece is in the shop once it is Live and has a main photo.";

export const ARCHIVED_HIDDEN_HINT =
  "Archived products are hidden here. Choose “Archived” or “All, including archived” to see them.";

export const SEARCH_PLACEHOLDER = "Name, code or SKU";

export const SEARCH_LABEL = "Search products by name, code or SKU";

/* ── Basics ─────────────────────────────────────────────────────────────── */

export const NAME_HINT = "As customers see it, e.g. Linen Camp Shirt.";

export const CODE_HINT = "Three letters used in every SKU for this piece.";

export const SUMMARY_HINT =
  "One line, shown under the name on the product page and used as the description in search results.";

export const DESCRIPTION_HINT = "The longer read on the product page — the story of the piece.";

export const DETAILS_HINT = "One short line each: collar, pockets, closure, anything worth naming.";

export const MATERIAL_HINT = "The cloth, e.g. 100% Irish linen, 180gsm.";

export const CARE_HINT = "One line each: how to wash, dry and press it.";

export const FIT_HINT = "How it sits, e.g. Relaxed through the body. Take your usual size.";

export const MODEL_NOTE_HINT = "e.g. Model is 188cm and wears a size M.";

export function lockedCodeExplanation(code: string, variantCount: number): string {
  return `The code can’t change: ${variantCount === 1 ? "1 SKU already includes" : `${variantCount} SKUs already include`} ${code}. Codes are printed on labels and kept on past orders.`;
}

/* ── Organisation ───────────────────────────────────────────────────────── */

export const CATEGORY_HINT =
  "Every piece belongs to exactly one. Moving it to another category doesn’t change any SKU it already has — SKUs keep the code they were given.";

export const COLLECTIONS_HINT =
  "Campaigns and drops. A piece can be in several; it joins the end of each one, and the collection’s own page is where the order is changed.";

export const TAGS_HINT = "Words that help search find the piece, separated by commas. Customers never see them.";

export const BADGE_HINT = "A small chip on the product card. Leave it as “No badge” for most pieces.";

export const FEATURED_HINT = "Featured pieces are shown first on the shop’s listings.";

export const BESTSELLER_HINT =
  "Where it sits on the Best sellers shelf — 1 is first. Leave it empty for anything that isn’t a best seller.";

/* ── Pricing ────────────────────────────────────────────────────────────── */

export const PRICE_HINT = "What a customer pays. A variant can be given its own price under “Variants and stock”.";

export const COMPARE_AT_HINT =
  "What it used to cost. Set it above the price to show the piece as reduced; leave it empty when it isn’t on sale.";

/* ── Search engines ─────────────────────────────────────────────────────── */

export const SEO_INTRO =
  "How the piece reads on Google and when its address is shared. Leave both empty and the shop uses the name and the summary, which is right for most pieces.";

export const SEO_TITLE_HINT = "Around 60 characters. Longer titles are cut short in search results.";

export const SEO_DESCRIPTION_HINT = "Around 155 characters. Longer descriptions are cut short in search results.";

/* ── Status ─────────────────────────────────────────────────────────────── */

export const STATUS_INTRO =
  "Draft while you work on it, Live once customers should see it, Archived when it has gone for good but past orders still name it.";

export const PUBLISH_CHECKLIST_INTRO = "What the shop needs before this piece can go live.";

export const ARCHIVE_EXPLANATION =
  "Archiving takes the piece out of the shop and out of the day-to-day lists, and keeps it for past orders. You can bring it back at any time.";

export const DELETE_EXPLANATION =
  "Deleting removes the piece, its colours, sizes, variants and stock for good. Its photos stay in the library. Only a draft that has never been ordered can be deleted — anything a customer has bought is archived instead, so their order still makes sense.";
