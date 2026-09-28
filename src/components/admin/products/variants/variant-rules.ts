import type { ProductStatus, SizeSystem } from "@/generated/prisma/enums";
import { buildVariantSku, skuPartProblem } from "@/lib/admin/sku";
import { pieces } from "@/lib/admin/stock-state";

/*
 * The rules of a product's colours, sizes and variants, pure (no server or
 * browser APIs), so the variants service, its server actions, the section's
 * client components and the tests all agree:
 *
 * - the shapes the section works with (serialisable, for client components);
 * - the colour × size matrix: which variants exist, which are missing, and which
 *   belong to a colour or size the product no longer offers;
 * - when a colour, size or variant may be removed (never once ordered, never
 *   with stock), and how to say why not;
 * - size systems (a product's sizes all come from one: clothing, waist, belt or
 *   one size), ids for new colours and sizes, and the create-variants form's
 *   field names.
 */

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export const SIZE_SYSTEMS = ["APPAREL", "WAIST", "BELT", "ONE_SIZE"] as const satisfies readonly SizeSystem[];

export interface OptionColor {
  /** The colour's slug, e.g. "pale-blue". */
  id: string;
  name: string;
  /** "#RRGGBB". */
  hex: string;
  /** Three letters, used in SKUs. */
  code: string;
}

export interface OptionSize {
  id: string;
  label: string;
  system: SizeSystem;
  /** Used in SKUs, e.g. "M", "32", "OS". */
  code: string;
  /** Registry order (smallest first). */
  sortOrder: number;
}

/** A colour on the product, with how many of its photos are set to it. */
export interface ProductColorView extends OptionColor {
  photos: number;
}

/** A registry colour or size, with how many products use it. */
export interface RegistryColor extends OptionColor {
  productCount: number;
}

export interface RegistrySize extends OptionSize {
  productCount: number;
}

export interface VariantView {
  id: string;
  sku: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  sizeId: string;
  sizeLabel: string;
  /** Switched on (can be bought when it has stock) or off (kept for order history). */
  isActive: boolean;
  /** This variant's own price in kobo, or null to use the product price. */
  priceOverride: number | null;
  onHand: number;
  /** Held for checkouts awaiting payment. */
  reserved: number;
  lowStockThreshold: number;
  /** Order lines naming this variant, in orders of any status. */
  orderLines: number;
  /** Pieces in paid orders that haven't shipped (already out of on hand, still on the shelf). */
  awaitingShipment: number;
}

export interface ProductVariantsData {
  product: {
    id: string;
    name: string;
    /** The product part of every SKU. */
    code: string;
    status: ProductStatus;
    /** Kobo. */
    price: number;
    categoryName: string;
    /** The category part of every SKU. */
    categoryCode: string;
  };
  /** In the order customers see them. */
  colors: ProductColorView[];
  /** In the order customers see them. */
  sizes: OptionSize[];
  variants: VariantView[];
  registry: { colors: RegistryColor[]; sizes: RegistrySize[] };
}

/* ── Limits ─────────────────────────────────────────────────────────────── */

export const MAX_PRODUCT_COLORS = 20;
export const MAX_PRODUCT_SIZES = 15;
export const COLOR_NAME_MAX = 40;
export const SIZE_LABEL_MAX = 20;

/* ── Words ──────────────────────────────────────────────────────────────── */

/** "Sand, M" — a variant in the owner's words. */
export function variantOptionLabel(colorName: string, sizeLabel: string): string {
  return `${colorName}, ${sizeLabel}`;
}

/** "1 variant", "5 variants". */
export function variantCount(count: number): string {
  return `${count.toLocaleString("en-NG")} ${count === 1 ? "variant" : "variants"}`;
}

/** "a", "a and b", "a, b and c". */
export function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(position: number): string {
  const tens = position % 100;
  if (tens >= 11 && tens <= 13) return `${position}th`;
  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

export const SIZE_SYSTEM_LABELS: Record<SizeSystem, { label: string; hint: string }> = {
  APPAREL: { label: "Clothing sizes", hint: "Shirts, knitwear, jackets and tees." },
  WAIST: { label: "Waist sizes", hint: "Trousers and denim, by waist in inches." },
  BELT: { label: "Belt sizes", hint: "Belts, by length in centimetres." },
  ONE_SIZE: { label: "One size", hint: "Pieces that come in a single size." },
};

export function sizeSystemLabel(system: SizeSystem): string {
  return SIZE_SYSTEM_LABELS[system]?.label ?? "Sizes";
}

export function isSizeSystem(value: unknown): value is SizeSystem {
  return typeof value === "string" && (SIZE_SYSTEMS as readonly string[]).includes(value);
}

/* ── Ids, hex values ────────────────────────────────────────────────────── */

/** "Pale Blue" → "pale-blue"; accents dropped, anything else becomes a hyphen. At most 60 characters. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** A new colour's id: the slug of its name, like the seeded ones ("pale-blue"). Empty when the name has no letters or digits. */
export function colorIdFromName(name: string): string {
  return slugify(name);
}

const SIZE_ID_PREFIX: Record<SizeSystem, string> = { APPAREL: "", WAIST: "w", BELT: "b", ONE_SIZE: "" };

/** A new size's id, like the seeded ones: "xxxl", "w40" (waist), "b105" (belt), "one-size". Empty when the label has no letters or digits. */
export function sizeIdFor(system: SizeSystem, label: string): string {
  const slug = slugify(label);
  if (!slug) return "";
  const prefix = SIZE_ID_PREFIX[system] ?? "";
  // "w" + "40" reads "w40"; "w" + "long" would read "wlong", so words get a hyphen.
  return prefix ? (/^\d/.test(slug) ? `${prefix}${slug}` : `${prefix}-${slug}`) : slug;
}

/** "#abc", "abc", "#AABBCC" → "#AABBCC"; null for anything that isn't a hex colour. */
export function normaliseHex(text: string): string | null {
  if (typeof text !== "string") return null;
  const value = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return `#${[...value].map((digit) => digit + digit).join("")}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value}`.toUpperCase();
  return null;
}

/* ── Order ──────────────────────────────────────────────────────────────── */

/** `ids` with `id` moved one place earlier or later; null when it's already at that end (or not there). */
export function moveInList<T>(ids: readonly T[], id: T, direction: "up" | "down"): T[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/* ── Sizes ──────────────────────────────────────────────────────────────── */

/** The size system a product's sizes come from, or null when it has none yet. */
export function productSizeSystem(sizes: readonly Pick<OptionSize, "system">[]): SizeSystem | null {
  return sizes[0]?.system ?? null;
}

/**
 * Why `size` can't be added to a product with `current` sizes; null when it can.
 * A product's sizes all come from one system (the product page's size guide and
 * filters rely on it), and a one-size product has exactly one size.
 */
export function sizeAddProblem(current: readonly OptionSize[], size: OptionSize): string | null {
  if (current.some((existing) => existing.id === size.id)) return `${size.label} is already on this product.`;
  const system = productSizeSystem(current);
  if (system && system !== size.system) {
    return `This product uses ${sizeSystemLabel(system).toLowerCase()}, so ${size.label} (${sizeSystemLabel(size.system).toLowerCase()}) can’t be added. A product’s sizes all come from one kind.`;
  }
  if (system === "ONE_SIZE" || (size.system === "ONE_SIZE" && current.length > 0)) {
    return "A one-size product has just one size.";
  }
  if (current.length >= MAX_PRODUCT_SIZES) {
    return `A product can have up to ${MAX_PRODUCT_SIZES} sizes.`;
  }
  return null;
}

/**
 * The product's sizes with `size` added where it falls in the registry's order
 * (so adding XS to S–XL puts it first), keeping the product's own order otherwise.
 */
export function insertSizeInOrder<S extends Pick<OptionSize, "id" | "sortOrder">>(current: readonly S[], size: S): S[] {
  const index = current.findIndex((existing) => existing.sortOrder > size.sortOrder);
  if (index === -1) return [...current, size];
  return [...current.slice(0, index), size, ...current.slice(index)];
}

/* ── Removing colours, sizes and variants ───────────────────────────────── */

/** What an option's (or a variant's) removal depends on. */
export type VariantFacts = Pick<VariantView, "isActive" | "onHand" | "reserved" | "orderLines">;

export interface OptionUsage {
  variants: number;
  /** Switched on. */
  active: number;
  /** Named in at least one order. */
  ordered: number;
  /** With pieces on hand or held. */
  stocked: number;
  onHand: number;
  reserved: number;
}

export function optionUsage(variants: readonly VariantFacts[]): OptionUsage {
  const usage: OptionUsage = { variants: 0, active: 0, ordered: 0, stocked: 0, onHand: 0, reserved: 0 };
  for (const variant of variants) {
    usage.variants++;
    if (variant.isActive) usage.active++;
    if (variant.orderLines > 0) usage.ordered++;
    if (variant.onHand > 0 || variant.reserved > 0) usage.stocked++;
    usage.onHand += Math.max(0, variant.onHand);
    usage.reserved += Math.max(0, variant.reserved);
  }
  return usage;
}

/**
 * A colour or size can come off a product only when none of its variants has
 * ever been ordered (orders keep a link to what was bought) and none has stock
 * (pieces on the shelf, or held for an unpaid order).
 */
export function canRemoveOption(usage: OptionUsage): boolean {
  return usage.ordered === 0 && usage.onHand === 0 && usage.reserved === 0;
}

function orderedPhrase(usage: OptionUsage): string {
  if (usage.ordered === usage.variants) {
    return usage.variants === 1 ? "its variant has been ordered" : `all ${usage.variants} of its variants have been ordered`;
  }
  return `${usage.ordered} of its variants ${usage.ordered === 1 ? "has" : "have"} been ordered`;
}

function stockPhrase(onHand: number, reserved: number): string {
  const held = reserved > 0 ? ` (${reserved.toLocaleString("en-NG")} held for unpaid orders)` : "";
  return `${pieces(onHand)} ${onHand === 1 ? "is" : "are"} in stock${held}`;
}

/** Why a colour or size can't be removed, e.g. "Sand can’t be removed: 2 of its variants have been ordered and 3 pieces are in stock." Null when it can. */
export function optionRemovalProblem(name: string, usage: OptionUsage): string | null {
  if (canRemoveOption(usage)) return null;
  const reasons: string[] = [];
  if (usage.ordered > 0) reasons.push(orderedPhrase(usage));
  if (usage.onHand > 0 || usage.reserved > 0) reasons.push(stockPhrase(usage.onHand, usage.reserved));
  return `${name} can’t be removed: ${joinWords(reasons)}.`;
}

/** What to do instead, after optionRemovalProblem. */
export function optionRemovalAdvice(kind: "colour" | "size", name: string, usage: OptionUsage): string {
  const parts: string[] = [];
  if (usage.ordered > 0) {
    parts.push("Orders keep a record of exactly what was bought, so variants that have been ordered stay.");
  }
  if (usage.onHand > 0 || usage.reserved > 0) {
    parts.push(
      usage.reserved > 0
        ? "Pieces held for unpaid orders go back once those orders are paid or released; pieces on hand can be taken out with “Adjust stock”."
        : "To remove it, first take its pieces out of stock with “Adjust stock” or “Record a count”.",
    );
  }
  if (usage.active > 0) {
    parts.push(
      `To stop selling ${name}, switch its variants off: customers then see ${kind === "colour" ? "it" : "that size"} as sold out.`,
    );
  } else if (usage.variants > 0) {
    parts.push(`Its variants are already switched off, so customers can’t buy ${name}.`);
  }
  return parts.join(" ");
}

export type VariantDeleteBlock = "ordered" | "stock";

/** Why a variant can't be deleted (never once ordered, never with stock); null when it can. */
export function variantDeleteBlock(variant: VariantFacts): VariantDeleteBlock | null {
  if (variant.orderLines > 0) return "ordered";
  if (variant.onHand > 0 || variant.reserved > 0) return "stock";
  return null;
}

/** The explanation for a variant that can't be deleted, with what to do instead. */
export function variantDeleteBlockedMessage(variant: VariantFacts & Pick<VariantView, "sku">): string {
  const block = variantDeleteBlock(variant);
  if (block === null) return "";
  const instead = variant.isActive
    ? " To stop selling it, switch it off instead."
    : " It’s already switched off, so customers can’t buy it.";
  if (block === "ordered") {
    return `${variant.sku} has been ordered, so it’s kept for the order history and can’t be deleted.${instead}`;
  }
  const held =
    variant.reserved > 0 ? `, ${variant.reserved.toLocaleString("en-NG")} of them held for unpaid orders` : "";
  const clear =
    variant.reserved > 0
      ? " Held pieces go back once those orders are paid or released; pieces on hand can be taken out with “Adjust stock”."
      : " Take them out of stock first with “Adjust stock” or “Record a count”.";
  return `${variant.sku} can’t be deleted while it has ${pieces(variant.onHand)} on hand${held}.${clear}${instead}`;
}

/* ── The matrix ─────────────────────────────────────────────────────────── */

export interface MatrixCell {
  color: OptionColor;
  size: OptionSize;
  /** Null when this colour and size hasn't been created yet. */
  variant: VariantView | null;
  /** The SKU the variant has, or would get (null when a code can't be used in SKUs). */
  sku: string | null;
}

export interface MatrixGroup {
  color: ProductColorView;
  /** One per product size, in the product's size order. */
  cells: MatrixCell[];
  /** Cells with a variant. */
  created: number;
}

export interface VariantMatrix {
  groups: MatrixGroup[];
  /** Colour and size combinations without a variant, colour by colour. */
  missing: MatrixCell[];
  /** Variants whose colour or size the product no longer offers (kept for order history). */
  orphans: VariantView[];
  /** Codes that stop new SKUs being made, in sentences for the owner. */
  skuProblems: string[];
}

export function comboKey(colorId: string, sizeId: string): string {
  return `${colorId}|${sizeId}`;
}

/**
 * The product's colours × sizes: for each colour, one cell per size with its
 * variant (or null, with the SKU it would get), plus the missing combinations
 * and any variants left over from colours or sizes taken off the product.
 */
export function buildVariantMatrix(input: {
  product: Pick<ProductVariantsData["product"], "code" | "categoryCode">;
  colors: readonly ProductColorView[];
  sizes: readonly OptionSize[];
  variants: readonly VariantView[];
}): VariantMatrix {
  const { product, colors, sizes, variants } = input;
  const byCombo = new Map(variants.map((variant) => [comboKey(variant.colorId, variant.sizeId), variant]));

  const skuProblems: string[] = [];
  const addProblem = (problem: string | null) => {
    if (problem && !skuProblems.includes(problem)) skuProblems.push(problem);
  };
  addProblem(skuPartProblem("category", product.categoryCode));
  addProblem(skuPartProblem("product", product.code));
  const baseOk = skuProblems.length === 0;

  const colorOk = new Map(colors.map((color) => [color.id, skuPartProblem("colour", color.code)]));
  const sizeOk = new Map(sizes.map((size) => [size.id, skuPartProblem("size", size.code)]));
  for (const color of colors) {
    const problem = colorOk.get(color.id);
    if (problem) addProblem(`${color.name}: ${problem}`);
  }
  for (const size of sizes) {
    const problem = sizeOk.get(size.id);
    if (problem) addProblem(`Size ${size.label}: ${problem}`);
  }

  const missing: MatrixCell[] = [];
  const groups = colors.map((color): MatrixGroup => {
    let created = 0;
    const cells = sizes.map((size): MatrixCell => {
      const variant = byCombo.get(comboKey(color.id, size.id)) ?? null;
      if (variant) {
        created++;
        return { color, size, variant, sku: variant.sku };
      }
      const buildable = baseOk && !colorOk.get(color.id) && !sizeOk.get(size.id);
      const sku = buildable
        ? buildVariantSku({
            categoryCode: product.categoryCode,
            productCode: product.code,
            colorCode: color.code,
            sizeCode: size.code,
          })
        : null;
      const cell = { color, size, variant: null, sku };
      missing.push(cell);
      return cell;
    });
    return { color, cells, created };
  });

  const colorIds = new Set(colors.map((color) => color.id));
  const sizeIds = new Set(sizes.map((size) => size.id));
  const orphans = variants
    .filter((variant) => !colorIds.has(variant.colorId) || !sizeIds.has(variant.sizeId))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return { groups, missing, orphans, skuProblems };
}

/* ── Totals ─────────────────────────────────────────────────────────────── */

export interface VariantSummary {
  total: number;
  active: number;
  inactive: number;
  onHand: number;
  reserved: number;
  /** Pieces customers can buy now, across switched-on variants. */
  available: number;
  /** Switched-on variants with nothing available. */
  soldOut: number;
  /** Switched-on variants at or below their low-stock level (but not sold out). */
  lowStock: number;
}

export function availableOf(variant: Pick<VariantView, "onHand" | "reserved">): number {
  return Math.max(0, variant.onHand - variant.reserved);
}

export function summariseVariants(variants: readonly VariantView[]): VariantSummary {
  const summary: VariantSummary = {
    total: 0,
    active: 0,
    inactive: 0,
    onHand: 0,
    reserved: 0,
    available: 0,
    soldOut: 0,
    lowStock: 0,
  };
  for (const variant of variants) {
    summary.total++;
    summary.onHand += variant.onHand;
    summary.reserved += variant.reserved;
    if (!variant.isActive) {
      summary.inactive++;
      continue;
    }
    summary.active++;
    const available = availableOf(variant);
    summary.available += available;
    if (available <= 0) summary.soldOut++;
    else if (available <= variant.lowStockThreshold) summary.lowStock++;
  }
  return summary;
}

/* ── The create-variants form ───────────────────────────────────────────── */

/** Ticked combinations are sent as repeated "combo" fields, each "colourId|sizeId". */
export const COMBO_FIELD = "combo";

/** The opening-stock field for one combination (also the key of its error). */
export function openingStockField(colorId: string, sizeId: string): string {
  return `stock|${colorId}|${sizeId}`;
}

const OPTION_ID = /^[A-Za-z0-9_.:-]{1,191}$/;

/** "colourId|sizeId" → its ids; null for anything else. */
export function parseComboKey(value: unknown): { colorId: string; sizeId: string } | null {
  if (typeof value !== "string") return null;
  const parts = value.split("|");
  if (parts.length !== 2) return null;
  const [colorId, sizeId] = parts;
  return OPTION_ID.test(colorId) && OPTION_ID.test(sizeId) ? { colorId, sizeId } : null;
}

/** What the section says about selling, by product status. */
export function saleNote(status: ProductStatus): string | null {
  switch (status) {
    case "DRAFT":
      return "This product is a draft, so nothing here is on sale until it’s live.";
    case "ARCHIVED":
      return "This product is archived, so nothing here is on sale.";
    default:
      return null;
  }
}
