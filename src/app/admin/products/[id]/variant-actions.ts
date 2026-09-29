"use server";

import { z } from "zod";

import {
  COLOR_NAME_MAX,
  COMBO_FIELD,
  MAX_PRODUCT_COLORS,
  MAX_PRODUCT_SIZES,
  SIZE_LABEL_MAX,
  SIZE_SYSTEMS,
  normaliseHex,
  openingStockField,
  parseComboKey,
} from "@/components/admin/products/variants/variant-rules";
import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import { refreshAdminView } from "@/lib/admin/refresh";
import { colorCodeProblem, normaliseSkuCode, sizeCodeProblem } from "@/lib/admin/sku";
import { MAX_STOCK_CHANGE } from "@/lib/admin/stock-state";
import { formDataToObject, zId, zInt, zOneOf, zOptionalNaira, zText } from "@/lib/admin/validation";
import * as variants from "@/lib/admin/variants";

/*
 * A product's colours, sizes and variants (the editor's "Colours and sizes" and
 * "Variants and stock" sections). Stock changes on a variant — adjust, count,
 * low-stock level, history — use the inventory page's actions
 * (app/admin/inventory/actions.ts), so both places behave identically.
 *
 * Each action: admin check and rate limit (withAdmin), every field re-validated
 * with zod, then one transaction in lib/admin/variants that locks the product,
 * checks each colour, size and variant id belongs to it, and writes the audit
 * entry naming the admin. After a change the storefront's cached catalogue is
 * expired (which also re-renders this page with the new data); after a refused
 * change the page is re-rendered too, so it shows what stopped it.
 */

const WRITE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const MOVE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

const MISSING = "Something is missing from this form. Close it, refresh the page and try again.";

type Result<T = null> = AdminActionResult<T>;

/** After the service has answered: refresh the storefront on success, this page either way. */
function settle<T>(result: Result<T>): Result<T> {
  if (result.ok) refreshStorefrontCatalog();
  else refreshAdminView();
  return result;
}

const ids = (message: string, max: number) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value]),
    z.array(zId(MISSING)).min(1, message).max(max, `Choose up to ${max} at a time.`),
  );

const direction = zOneOf(["up", "down"] as const, MISSING);
const optionKind = zOneOf(["color", "size"] as const, MISSING);
const flag = z.boolean({ error: MISSING });

/* ── Colours ────────────────────────────────────────────────────────────── */

const addColorsSchema = z.object({
  productId: zId(MISSING),
  colorId: ids("Choose at least one colour.", MAX_PRODUCT_COLORS),
});

/** Adds colours from the registry to the product. Form fields: productId, colorId (repeated). */
export async function addProductColors(_previous: Result | null, formData: FormData): Promise<Result> {
  return withAdmin<null>(
    "product.color.add",
    async (admin) => {
      const parsed = parseInput(addColorsSchema, formData);
      if (!parsed.ok) return parsed;
      return settle(
        await variants.addColorsToProduct({
          productId: parsed.data.productId,
          colorIds: parsed.data.colorId,
          actorId: admin.id,
        }),
      );
    },
    WRITE_LIMIT,
  );
}

const colorCode = z.preprocess(
  (value) => (typeof value === "string" ? normaliseSkuCode(value) : ""),
  z.string().superRefine((value, context) => {
    const problem = colorCodeProblem(value);
    if (problem) context.addIssue({ code: "custom", message: problem });
  }),
);

const hex = z.preprocess(
  (value) => (typeof value === "string" ? (normaliseHex(value) ?? value.trim()) : ""),
  z.string().regex(/^#[0-9A-F]{6}$/, "Enter a colour like #C9B592, or pick one with the colour picker."),
);

const createColorSchema = z.object({
  productId: zId(MISSING),
  name: zText({ max: COLOR_NAME_MAX, required: "Enter the colour’s name, e.g. Sand.", label: "The name" }),
  hex,
  code: colorCode,
});

/** Creates a colour in the shared registry and adds it to the product. Form fields: productId, name, hex, code. */
export async function createProductColor(_previous: Result | null, formData: FormData): Promise<Result> {
  return withAdmin<null>(
    "product.color.create",
    async (admin) => {
      const parsed = parseInput(createColorSchema, formData);
      if (!parsed.ok) return parsed;
      return settle(await variants.createColorForProduct({ ...parsed.data, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}

const moveColorSchema = z.object({ productId: zId(MISSING), colorId: zId(MISSING), direction });

/** Moves a colour one place earlier or later. Input: { productId, colorId, direction: "up" | "down" }. */
export async function moveProductColor(input: unknown): Promise<Result> {
  return withAdmin<null>(
    "product.color.move",
    async (admin) => {
      const parsed = parseInput(moveColorSchema, input);
      if (!parsed.ok) return parsed;
      return settle(await variants.moveProductColor({ ...parsed.data, actorId: admin.id }));
    },
    MOVE_LIMIT,
  );
}

/* ── Sizes ──────────────────────────────────────────────────────────────── */

const addSizesSchema = z.object({
  productId: zId(MISSING),
  sizeId: ids("Choose at least one size.", MAX_PRODUCT_SIZES),
});

/** Adds sizes from the registry to the product, each in size order. Form fields: productId, sizeId (repeated). */
export async function addProductSizes(_previous: Result | null, formData: FormData): Promise<Result> {
  return withAdmin<null>(
    "product.size.add",
    async (admin) => {
      const parsed = parseInput(addSizesSchema, formData);
      if (!parsed.ok) return parsed;
      return settle(
        await variants.addSizesToProduct({
          productId: parsed.data.productId,
          sizeIds: parsed.data.sizeId,
          actorId: admin.id,
        }),
      );
    },
    WRITE_LIMIT,
  );
}

const sizeCode = z.preprocess(
  (value) => (typeof value === "string" ? normaliseSkuCode(value) : ""),
  z.string().superRefine((value, context) => {
    const problem = sizeCodeProblem(value);
    if (problem) context.addIssue({ code: "custom", message: problem });
  }),
);

const createSizeSchema = z.object({
  productId: zId(MISSING),
  label: zText({
    max: SIZE_LABEL_MAX,
    required: "Enter the size as customers will see it, e.g. XXXL or 40.",
    label: "The size",
  }),
  system: zOneOf(SIZE_SYSTEMS, "Choose the kind of size."),
  code: sizeCode,
  /** The size it follows in size order; empty to put it first. */
  after: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? null : value),
    zId("Choose where the new size goes.").nullable(),
  ),
});

/**
 * Creates a size in the shared registry, in size order, and adds it to the
 * product. Form fields: productId, label, system, code, after.
 */
export async function createProductSize(_previous: Result | null, formData: FormData): Promise<Result> {
  return withAdmin<null>(
    "product.size.create",
    async (admin) => {
      const parsed = parseInput(createSizeSchema, formData);
      if (!parsed.ok) return parsed;
      return settle(await variants.createSizeForProduct({ ...parsed.data, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}

const moveSizeSchema = z.object({ productId: zId(MISSING), sizeId: zId(MISSING), direction });

/** Moves a size one place earlier or later. Input: { productId, sizeId, direction: "up" | "down" }. */
export async function moveProductSize(input: unknown): Promise<Result> {
  return withAdmin<null>(
    "product.size.move",
    async (admin) => {
      const parsed = parseInput(moveSizeSchema, input);
      if (!parsed.ok) return parsed;
      return settle(await variants.moveProductSize({ ...parsed.data, actorId: admin.id }));
    },
    MOVE_LIMIT,
  );
}

/* ── Colours and sizes together ─────────────────────────────────────────── */

const removeOptionSchema = z.object({ productId: zId(MISSING), kind: optionKind, optionId: zId(MISSING) });

/**
 * Takes a colour or size off the product with its variants — only when none of
 * them has been ordered or has stock. Input: { productId, kind: "color" | "size", optionId }.
 */
export async function removeProductOption(input: unknown): Promise<Result> {
  return withAdmin<null>(
    "product.option.remove",
    async (admin) => {
      const parsed = parseInput(removeOptionSchema, input);
      if (!parsed.ok) return parsed;
      return settle(await variants.removeProductOption({ ...parsed.data, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}

const optionActiveSchema = z.object({
  productId: zId(MISSING),
  kind: optionKind,
  optionId: zId(MISSING),
  isActive: flag,
});

/**
 * Switches every variant of one colour or size on or off.
 * Input: { productId, kind: "color" | "size", optionId, isActive }.
 */
export async function setProductOptionVariantsActive(input: unknown): Promise<Result<{ changed: number }>> {
  return withAdmin<{ changed: number }>(
    "product.option.active",
    async (admin) => {
      const parsed = parseInput(optionActiveSchema, input);
      if (!parsed.ok) return parsed;
      return settle(await variants.setOptionVariantsActive({ ...parsed.data, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}

/* ── Variants ───────────────────────────────────────────────────────────── */

const productIdSchema = z.object({ productId: zId(MISSING) });

const openingStock = z.preprocess(
  (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? "0" : value),
  zInt({ min: 0, max: MAX_STOCK_CHANGE, label: "Opening stock" }),
);

/**
 * Creates variants for ticked colour and size combinations, each with its opening
 * stock. Form fields: productId, combo (repeated "colourId|sizeId"), and for each
 * ticked combination "stock|colourId|sizeId" (blank counts as 0).
 */
export async function createProductVariants(
  _previous: Result<{ created: number }> | null,
  formData: FormData,
): Promise<Result<{ created: number }>> {
  return withAdmin<{ created: number }>(
    "product.variants.create",
    async (admin) => {
      const values = formDataToObject(formData);
      const base = parseInput(productIdSchema, values);
      if (!base.ok) return base;

      const raw = values[COMBO_FIELD];
      const combos = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
      if (combos.length === 0) {
        const message = "Tick at least one colour and size to create.";
        return { ok: false, message, fieldErrors: { [COMBO_FIELD]: message } };
      }
      if (combos.length > MAX_PRODUCT_COLORS * MAX_PRODUCT_SIZES) return { ok: false, message: MISSING };

      const items: variants.NewVariantInput[] = [];
      const fieldErrors: Record<string, string> = {};
      for (const combo of combos) {
        const key = parseComboKey(combo);
        if (!key) return { ok: false, message: MISSING };
        const field = openingStockField(key.colorId, key.sizeId);
        const stock = openingStock.safeParse(values[field]);
        if (!stock.success) {
          fieldErrors[field] = stock.error.issues[0]?.message ?? "Enter a whole number of pieces.";
          continue;
        }
        items.push({ ...key, openingStock: stock.data });
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { ok: false, message: "Check the opening stock figures.", fieldErrors };
      }

      return settle(await variants.createVariants({ productId: base.data.productId, items, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}

const variantActiveSchema = z.object({ productId: zId(MISSING), variantId: zId(MISSING), isActive: flag });

/**
 * Switches one variant on or off. Switched off, it can't be bought but stays for
 * order history. Input: { productId, variantId, isActive }.
 */
export async function setProductVariantActive(input: unknown): Promise<Result<{ isActive: boolean }>> {
  return withAdmin<{ isActive: boolean }>(
    "product.variant.active",
    async (admin) => {
      const parsed = parseInput(variantActiveSchema, input);
      if (!parsed.ok) return parsed;
      return settle(await variants.setVariantActive({ ...parsed.data, actorId: admin.id }));
    },
    MOVE_LIMIT,
  );
}

const priceSchema = z.object({
  productId: zId(MISSING),
  variantId: zId(MISSING),
  priceOverride: zOptionalNaira({ min: 100, label: "The price" }),
});

/**
 * Sets one variant's own price (blank: use the product price).
 * Form fields: productId, variantId, priceOverride (naira, e.g. "48,000").
 */
export async function saveProductVariantPrice(
  _previous: Result<{ priceOverride: number | null }> | null,
  formData: FormData,
): Promise<Result<{ priceOverride: number | null }>> {
  return withAdmin<{ priceOverride: number | null }>(
    "product.variant.price",
    async (admin) => {
      const parsed = parseInput(priceSchema, formData);
      if (!parsed.ok) return parsed;
      return settle(await variants.setVariantPrice({ ...parsed.data, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}

const deleteSchema = z.object({ productId: zId(MISSING), variantId: zId(MISSING) });

/**
 * Deletes a variant that has never been ordered and has no stock.
 * Input: { productId, variantId }.
 */
export async function deleteProductVariant(input: unknown): Promise<Result> {
  return withAdmin<null>(
    "product.variant.delete",
    async (admin) => {
      const parsed = parseInput(deleteSchema, input);
      if (!parsed.ok) return parsed;
      return settle(await variants.deleteVariant({ ...parsed.data, actorId: admin.id }));
    },
    WRITE_LIMIT,
  );
}
