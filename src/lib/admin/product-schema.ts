import { z } from "zod";

import type { ProductBadge, ProductStatus } from "@/generated/prisma/enums";

import { MAX_KOBO } from "./format";
import type { ListParamsAllowed } from "./pagination";
import { PRODUCT_SLUG_MAX } from "./slug";
import { zCheckbox, zId, zList, zNaira, zOneOf, zOptionalInt, zOptionalNaira, zOptionalText, zText } from "./validation";

/*
 * Everything the product forms and the product list agree on: field limits, the
 * product code, tags, the SEO counters, the publish checklist, and the zod
 * schemas each save re-validates with.
 *
 * Pure (no server or browser APIs, no database): the forms use the rules to hint
 * as the owner types, the server actions re-parse with the same schemas before
 * saving, and the tests exercise both. Nothing the browser checked is trusted.
 */

/* ── Where things live ──────────────────────────────────────────────────── */

export const PRODUCTS_PATH = "/admin/products";
export const NEW_PRODUCT_PATH = "/admin/products/new";

/** The editor for one product. */
export function productPath(id: string): string {
  return `${PRODUCTS_PATH}/${encodeURIComponent(id)}`;
}

/** The "as customers would see it" page for one product. */
export function productPreviewPath(id: string): string {
  return `${productPath(id)}/preview`;
}

/* ── Field limits ───────────────────────────────────────────────────────── */

/**
 * How long each field may be. Generous but finite: the name and summary appear on
 * cards and in search results, so they stay short; the description is the long
 * read on the product page.
 */
export const PRODUCT_FIELD_LIMITS = {
  name: 120,
  summary: 200,
  description: 4_000,
  material: 300,
  fit: 200,
  modelNote: 200,
  detail: 200,
  care: 200,
  tag: 40,
  seoTitle: 120,
  seoDescription: 320,
} as const;

export const MAX_DETAILS = 12;
export const MAX_CARE = 8;
export const MAX_TAGS = 12;
export const MAX_COLLECTIONS_PER_PRODUCT = 12;
export const MAX_BESTSELLER_RANK = 999;

/* ── The product code ───────────────────────────────────────────────────── */

/** Three capital letters, the third part of every SKU: "TBT-KNT-KPL-SND-M". */
export const PRODUCT_CODE_LENGTH = 3;

const PRODUCT_CODE_PATTERN = /^[A-Z]{3}$/;

/** What the owner typed, kept to three capital letters. */
export function normaliseProductCode(value: string): string {
  return typeof value === "string"
    ? value
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, PRODUCT_CODE_LENGTH)
    : "";
}

/** Why a product code can't be used, in a sentence for the owner; null when it can. */
export function productCodeProblem(code: string): string | null {
  const value = normaliseProductCode(code);
  if (value === "") return "Enter a three-letter code for SKUs, e.g. KPL for Knitted Polo.";
  if (!PRODUCT_CODE_PATTERN.test(value)) return "Use exactly three letters, e.g. KPL.";
  return null;
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/** The name's words in plain capital letters: "Knitted Polo" → ["KNITTED", "POLO"]. */
function letterWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

/**
 * A free three-letter code made from the name, in the style of the seeded ones:
 * initials of a multi-word name ("Knitted Polo" → KPL uses the first letter then
 * consonants), otherwise the first letter and the following consonants. Null when
 * the name has no letters to work with — the owner then types one.
 */
export function suggestProductCode(name: string, taken: Iterable<string>): string | null {
  const used = new Set<string>();
  for (const code of taken) used.add(normaliseProductCode(code));

  const words = letterWords(name);
  if (words.length === 0) return null;
  const letters = words.join("");
  const first = letters[0];

  /** The first letter, then consonants, then whatever letters are left. */
  const skeleton = (rest: string): string => {
    const picked = [first];
    let last = -1;
    for (let index = 0; index < rest.length && picked.length < PRODUCT_CODE_LENGTH; index++) {
      if (VOWELS.has(rest[index])) continue;
      picked.push(rest[index]);
      last = index;
    }
    for (let index = last + 1; index < rest.length && picked.length < PRODUCT_CODE_LENGTH; index++) {
      picked.push(rest[index]);
    }
    return picked.join("");
  };

  const candidates: string[] = [];
  if (words.length >= 3) candidates.push(words.slice(0, 3).map((word) => word[0]).join(""));
  if (words.length >= 2) candidates.push(skeleton(words.slice(1).join("")));
  candidates.push(skeleton(letters.slice(1)));
  candidates.push(letters.slice(0, PRODUCT_CODE_LENGTH));

  for (const candidate of candidates) {
    if (PRODUCT_CODE_PATTERN.test(candidate) && !used.has(candidate)) return candidate;
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const second of alphabet) {
    for (const third of alphabet) {
      const candidate = `${first}${second}${third}`;
      if (PRODUCT_CODE_PATTERN.test(candidate) && !used.has(candidate)) return candidate;
    }
  }
  return null;
}

/** What a SKU will look like, for the code field's hint: "TBT-KNT-KPL-SND-M". */
export function exampleProductSku(categoryCode: string, productCode: string): string {
  const category = categoryCode.trim().toUpperCase() || "…";
  const product = normaliseProductCode(productCode) || "…";
  return `TBT-${category}-${product}-SND-M`;
}

/* ── Tags ───────────────────────────────────────────────────────────────── */

/** "linen, summer , linen" → ["linen", "summer"]: trimmed, empties and repeats dropped. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const tag = part.trim().replace(/\s+/g, " ").slice(0, PRODUCT_FIELD_LIMITS.tag);
    if (tag === "") continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/** Tags back into the one-line field: ["linen", "summer"] → "linen, summer". */
export function formatTags(tags: readonly string[]): string {
  return tags.join(", ");
}

/* ── Badges ─────────────────────────────────────────────────────────────── */

const BADGE_LABELS: Record<ProductBadge, string> = {
  NEW: "New",
  LIMITED: "Limited",
  RESTOCKED: "Restocked",
  ONLINE_EXCLUSIVE: "Online exclusive",
};

export const PRODUCT_BADGES = ["NEW", "LIMITED", "RESTOCKED", "ONLINE_EXCLUSIVE"] as const;

export const PRODUCT_BADGE_OPTIONS: readonly { value: ProductBadge; label: string }[] = PRODUCT_BADGES.map(
  (value) => ({ value, label: BADGE_LABELS[value] }),
);

/** The word shown on the product card, e.g. "Online exclusive". */
export function productBadgeLabel(badge: ProductBadge | null): string | null {
  return badge ? BADGE_LABELS[badge] : null;
}

/* ── Search-result preview and counters ─────────────────────────────────── */

/** Google shows roughly this many characters of a title before cutting it. */
export const SEO_TITLE_RECOMMENDED = 60;

/** …and roughly this many of a description. */
export const SEO_DESCRIPTION_RECOMMENDED = 155;

/**
 * What the shop uses when the SEO title is empty — the same fallback as the
 * product page's metadata (app/product/[slug]/page.tsx).
 */
export function seoTitleFallback(name: string, categoryName: string): string {
  return categoryName ? `${name} — ${categoryName}` : name;
}

/** What the shop uses when the SEO description is empty: the product's summary. */
export function seoDescriptionFallback(summary: string): string {
  return summary;
}

export type CounterState = "ok" | "near" | "over";

/** How a character counter should read: fine, getting close, or past the recommendation. */
export function counterState(length: number, recommended: number): CounterState {
  if (length > recommended) return "over";
  if (length >= recommended - Math.max(5, Math.round(recommended * 0.1))) return "near";
  return "ok";
}

/* ── The publish checklist ──────────────────────────────────────────────── */

/** What the store needs before a product can go live. Counted on the server. */
export interface PublishFacts {
  price: number;
  /** Photos on the product, whatever their role. */
  imageCount: number;
  /** A photo set as the main image — without one the product shows nowhere. */
  hasPrimaryImage: boolean;
  variantCount: number;
  activeVariantCount: number;
  /** Pieces that could be sold right now across every switched-on variant. */
  availableToSell: number;
  /** The summary, description and material are written. */
  hasCopy: boolean;
}

export interface ChecklistItem {
  key: "price" | "copy" | "variants" | "image" | "stock";
  label: string;
  /** Why it matters, or what is missing. */
  detail: string;
  done: boolean;
  /** Publishing is blocked until every required item is done. */
  required: boolean;
}

/**
 * What is done and what is missing before this product can be published, in the
 * order the owner would work through it. "Required" items are the ones the shop
 * genuinely can't show a product without.
 */
export function publishChecklist(facts: PublishFacts): ChecklistItem[] {
  return [
    {
      key: "price",
      label: "It has a price",
      detail: facts.price > 0 ? "Customers see a price on the card and the product page." : "Set a price above ₦0.",
      done: facts.price > 0,
      required: true,
    },
    {
      key: "copy",
      label: "Its words are written",
      detail: facts.hasCopy
        ? "The summary, description and material are all filled in."
        : "The summary, description or material is still empty. Fill them in under “Basics” — customers read them on the product page.",
      done: facts.hasCopy,
      required: false,
    },
    {
      key: "variants",
      label: "It has at least one colour and size on sale",
      detail:
        facts.activeVariantCount > 0
          ? `${facts.activeVariantCount} ${facts.activeVariantCount === 1 ? "variant is" : "variants are"} switched on.`
          : facts.variantCount > 0
            ? "Every variant is switched off. Switch at least one back on in “Variants and stock”."
            : "Add colours and sizes in “Variants and stock”, then create the variants.",
      done: facts.activeVariantCount > 0,
      required: true,
    },
    {
      key: "image",
      label: "It has a main photo",
      detail: facts.hasPrimaryImage
        ? "Shown on shop cards, in search and at the top of the product page."
        : facts.imageCount > 0
          ? "There are photos, but none is set as the main image — without one the piece is left out of every list."
          : "Add a photo in “Photos” and set it as the main image.",
      done: facts.hasPrimaryImage,
      required: true,
    },
    {
      key: "stock",
      label: "Something is available to sell",
      detail:
        facts.availableToSell > 0
          ? `${facts.availableToSell} ${facts.availableToSell === 1 ? "piece" : "pieces"} available to sell.`
          : "You can still publish it: the shop will show it as sold out until stock arrives.",
      done: facts.availableToSell > 0,
      required: false,
    },
  ];
}

/** Whether the product can be published now. */
export function canPublish(facts: PublishFacts): boolean {
  return publishChecklist(facts).every((item) => !item.required || item.done);
}

/** The required items still missing, in the owner's words — for a refusal message. */
export function publishBlockers(facts: PublishFacts): string[] {
  return publishChecklist(facts)
    .filter((item) => item.required && !item.done)
    .map((item) => item.detail);
}

/** "It has a price and a main photo first." — one sentence naming what is missing. */
export function publishBlockedMessage(name: string, facts: PublishFacts): string {
  const blockers = publishBlockers(facts);
  if (blockers.length === 0) return "";
  return `“${name}” isn’t ready to publish yet. ${blockers.join(" ")}`;
}

/* ── The list URL ───────────────────────────────────────────────────────── */

export const PRODUCT_STOCK_FILTERS = ["in_stock", "low_stock", "out_of_stock"] as const;

export type ProductStockFilter = (typeof PRODUCT_STOCK_FILTERS)[number];

export const PRODUCT_STOCK_FILTER_OPTIONS: readonly { value: ProductStockFilter; label: string }[] = [
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Sold out" },
];

/** A whole product's stock, added up across its switched-on variants. */
export interface ProductStockTotals {
  /** Pieces that could be sold now (on hand less those held for unpaid orders). */
  available: number;
  /** The low-stock levels of those variants, added up. */
  threshold: number;
}

/**
 * How a whole product's stock reads in the list. Sold out when nothing at all can
 * be sold; low when what's left has fallen to the low-stock levels its variants
 * were given; in stock otherwise. The per-variant picture is on /admin/inventory.
 */
export function productStockState(totals: ProductStockTotals): ProductStockFilter {
  if (totals.available <= 0) return "out_of_stock";
  if (totals.available <= totals.threshold) return "low_stock";
  return "in_stock";
}

/** The extra status filter value meaning "archived ones too". */
export const PRODUCT_STATUS_ALL = "all";

export const PRODUCT_SORTS = ["updated", "name", "price"] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** What /admin/products accepts in its URL. Anything else is ignored. */
export const PRODUCT_LIST_ALLOWED: ListParamsAllowed = {
  sort: PRODUCT_SORTS,
  filters: ["status", "category", "collection", "stock"],
  defaultSort: "updated",
  defaultDir: "desc",
  filterValues: {
    status: ["DRAFT", "ACTIVE", "ARCHIVED", PRODUCT_STATUS_ALL],
    stock: PRODUCT_STOCK_FILTERS,
  },
};

/* ── Schemas ────────────────────────────────────────────────────────────── */

const MISSING = "Something is missing from this form. Refresh the page and try again.";

/** The moment the form was opened, so a save can tell it is working from stale values. */
const expectedUpdatedAt = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string().min(1, MISSING).max(40, MISSING),
);

/** /admin/products/new: just enough to create a draft. */
export const createProductSchema = z.object({
  name: zText({ max: PRODUCT_FIELD_LIMITS.name, required: "Enter a name.", label: "The name" }),
  categoryId: zId("Choose a category."),
  price: zNaira({ min: 1, required: "Enter a price.", label: "The price" }),
  code: zText({ max: 10, required: "Enter a three-letter code.", label: "The code" }),
});

export type CreateProductInput = z.output<typeof createProductSchema>;

/** The "Basics" section of the editor. */
export const productBasicsSchema = z.object({
  id: zId(MISSING),
  expectedUpdatedAt,
  name: zText({ max: PRODUCT_FIELD_LIMITS.name, required: "Enter a name.", label: "The name" }),
  slug: zText({ max: PRODUCT_SLUG_MAX + 40, label: "The web address" }),
  confirmSlugChange: zCheckbox(),
  code: zOptionalText({ max: 10, label: "The code" }),
  summary: zText({
    max: PRODUCT_FIELD_LIMITS.summary,
    required: "Write one line for cards and search results.",
    label: "The summary",
  }),
  description: zText({
    max: PRODUCT_FIELD_LIMITS.description,
    required: "Write the description shown on the product page.",
    label: "The description",
  }),
  details: zList({ maxItems: MAX_DETAILS, maxLength: PRODUCT_FIELD_LIMITS.detail, label: "Each detail" }),
  material: zText({ max: PRODUCT_FIELD_LIMITS.material, required: "Say what it’s made of.", label: "The material" }),
  care: zList({ maxItems: MAX_CARE, maxLength: PRODUCT_FIELD_LIMITS.care, label: "Each care line" }),
  fit: zOptionalText({ max: PRODUCT_FIELD_LIMITS.fit, label: "The fit" }),
  modelNote: zOptionalText({ max: PRODUCT_FIELD_LIMITS.modelNote, label: "The model note" }),
});

export type ProductBasicsInput = z.output<typeof productBasicsSchema>;

/** A repeated checkbox group: one value, several, or none at all. */
const idList = z.preprocess(
  (value) => {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
  },
  z
    .array(z.string().regex(/^[A-Za-z0-9_.:-]{1,191}$/, MISSING))
    .max(MAX_COLLECTIONS_PER_PRODUCT, `Choose no more than ${MAX_COLLECTIONS_PER_PRODUCT} collections.`),
);

/** The "Organisation" section: where the piece sits in the shop. */
export const productOrganisationSchema = z.object({
  id: zId(MISSING),
  expectedUpdatedAt,
  categoryId: zId("Choose a category."),
  collectionIds: idList,
  tags: zOptionalText({ max: MAX_TAGS * (PRODUCT_FIELD_LIMITS.tag + 2), label: "The tags" }),
  badge: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z.enum(PRODUCT_BADGES, { error: "Choose one of the badges in the list." }).nullable(),
  ),
  isFeatured: zCheckbox(),
  bestsellerRank: zOptionalInt({ min: 1, max: MAX_BESTSELLER_RANK, label: "The best-seller position" }),
});

export type ProductOrganisationInput = z.output<typeof productOrganisationSchema>;

/** The "Pricing" section. */
export const productPricingSchema = z
  .object({
    id: zId(MISSING),
    expectedUpdatedAt,
    price: zNaira({ min: 1, required: "Enter a price.", label: "The price" }),
    compareAtPrice: zOptionalNaira({ min: 0, max: MAX_KOBO, label: "The original price" }),
  })
  .refine(
    (data) => data.compareAtPrice === null || data.compareAtPrice > data.price,
    {
      path: ["compareAtPrice"],
      error:
        "The original price must be higher than the price, or left empty. Nothing is crossed out unless the piece is reduced.",
    },
  );

export type ProductPricingInput = z.output<typeof productPricingSchema>;

/** The "Search engines" section. */
export const productSeoSchema = z.object({
  id: zId(MISSING),
  expectedUpdatedAt,
  seoTitle: zOptionalText({ max: PRODUCT_FIELD_LIMITS.seoTitle, label: "The search title" }),
  seoDescription: zOptionalText({ max: PRODUCT_FIELD_LIMITS.seoDescription, label: "The search description" }),
});

export type ProductSeoInput = z.output<typeof productSeoSchema>;

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

/** One product's status, changed from the editor. */
export const productStatusSchema = z.object({
  id: zId(MISSING),
  expectedStatus: zOneOf(PRODUCT_STATUSES, MISSING),
  status: zOneOf(PRODUCT_STATUSES, "Choose Draft, Published or Archived."),
});

export type ProductStatusInput = z.output<typeof productStatusSchema>;

/** How many products one bulk step may touch. */
export const MAX_BULK_PRODUCTS = 100;

export const BULK_PRODUCT_ACTIONS = ["publish", "unpublish", "archive"] as const;

export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number];

/** Several products changed together from the list. */
export const bulkProductSchema = z.object({
  action: zOneOf(BULK_PRODUCT_ACTIONS, MISSING),
  ids: z.preprocess(
    (value) => {
      const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
      return [
        ...new Set(values.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim())),
      ];
    },
    z
      .array(z.string().regex(/^[A-Za-z0-9_.:-]{1,191}$/, MISSING))
      .min(1, "Choose at least one product.")
      .max(MAX_BULK_PRODUCTS, `Choose no more than ${MAX_BULK_PRODUCTS} products at a time.`),
  ),
});

export type BulkProductInput = z.output<typeof bulkProductSchema>;

/** Deleting a draft that has never been ordered. */
export const deleteProductSchema = z.object({ id: zId(MISSING) });

/** What each bulk step is called, and what it does. */
export const BULK_ACTION_COPY: Record<BulkProductAction, { verb: string; title: string; description: string }> = {
  publish: {
    verb: "Publish",
    title: "Publish these products?",
    description: "They appear in the shop straight away. Anything not ready is left as it is and named afterwards.",
  },
  unpublish: {
    verb: "Move to draft",
    title: "Move these products to draft?",
    description:
      "They disappear from the shop at once. Their pages stop working, and links to them will show “page not found”.",
  },
  archive: {
    verb: "Archive",
    title: "Archive these products?",
    description:
      "They disappear from the shop and from the day-to-day lists, but are kept for past orders. You can restore one at any time.",
  },
};

/** The status a bulk step moves products to. */
export const BULK_ACTION_STATUS: Record<BulkProductAction, ProductStatus> = {
  publish: "ACTIVE",
  unpublish: "DRAFT",
  archive: "ARCHIVED",
};
