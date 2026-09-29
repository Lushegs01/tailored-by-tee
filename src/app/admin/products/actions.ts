"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import { refreshAdminView } from "@/lib/admin/refresh";
import {
  PRODUCTS_PATH,
  bulkProductSchema,
  createProductSchema,
  deleteProductSchema,
  parseTags,
  productBasicsSchema,
  productOrganisationSchema,
  productPath,
  productPricingSchema,
  productSeoSchema,
  productStatusSchema,
  type BulkProductAction,
} from "@/lib/admin/product-schema";
import {
  bulkUpdateProductStatus,
  createProduct,
  deleteProduct,
  saveProductSection,
  setProductStatus,
  type BulkProductOutcome,
  type CreatedProduct,
  type ProductSaveOutcome,
  type ProductStatusOutcome,
} from "@/lib/admin/products";

/*
 * Product changes from /admin/products.
 *
 * Every one: the admin check and rate limit first (withAdmin), then zod over
 * everything the browser sent — nothing it already checked is trusted — then one
 * locked transaction in lib/admin/products that writes its audit entry with the
 * change, and only then the storefront caches. Failures come back as typed
 * results; nothing here throws to the browser.
 */

const WRITE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const HEAVY_LIMIT = { limit: 20, windowMs: 60_000 } as const;

/**
 * Expires the catalogue snapshot and the storefront pages a product change shows
 * on. The snapshot's tag already covers every page built from it; the product's
 * own address is revalidated as well, including the one it has just left.
 *
 * refreshAdminView re-renders the admin page the change was made from. The
 * product editor needs it: each of its forms carries the moment the page was
 * built, and the next save from that page is refused unless the page has caught
 * up with the row it has just changed.
 */
function refreshProductPages(slugs: readonly (string | null | undefined)[]): void {
  refreshStorefrontCatalog();
  refreshAdminView();
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/collections");
  for (const slug of new Set(slugs)) {
    if (slug) revalidatePath(`/product/${slug}`);
  }
}

/* ── Creating ───────────────────────────────────────────────────────────── */

/** AdminForm action for /admin/products/new. On success, opens the new draft's editor. */
export async function createProductAction(
  _previous: AdminActionResult<CreatedProduct> | null,
  formData: FormData,
): Promise<AdminActionResult<CreatedProduct>> {
  const result = await withAdmin<CreatedProduct>(
    "product.create",
    async (admin) => {
      const parsed = parseInput(createProductSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await createProduct(
        {
          name: parsed.data.name,
          categoryId: parsed.data.categoryId,
          price: parsed.data.price,
          code: parsed.data.code,
        },
        admin.id,
      );
      if (outcome.ok) {
        // A draft isn't in the shop yet, but the list and the category page count it.
        revalidatePath(PRODUCTS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
  if (result.ok) redirect(`${productPath(result.data.id)}?created=1`);
  return result;
}

/* ── The editor's sections ──────────────────────────────────────────────── */

type SaveResult = Promise<AdminActionResult<ProductSaveOutcome>>;

/** AdminForm action for the editor's "Basics" section. */
export async function saveProductBasics(
  _previous: AdminActionResult<ProductSaveOutcome> | null,
  formData: FormData,
): SaveResult {
  return withAdmin<ProductSaveOutcome>(
    "product.basics",
    async (admin) => {
      const parsed = parseInput(productBasicsSchema, formData);
      if (!parsed.ok) return parsed;
      const { id, expectedUpdatedAt, ...fields } = parsed.data;
      const outcome = await saveProductSection(id, expectedUpdatedAt, { section: "basics", ...fields }, admin.id);
      if (outcome.ok && outcome.data.changed.length > 0) {
        refreshProductPages([outcome.data.slug, outcome.data.previousSlug]);
        revalidatePath(PRODUCTS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/** AdminForm action for the editor's "Organisation" section. */
export async function saveProductOrganisation(
  _previous: AdminActionResult<ProductSaveOutcome> | null,
  formData: FormData,
): SaveResult {
  return withAdmin<ProductSaveOutcome>(
    "product.organisation",
    async (admin) => {
      const parsed = parseInput(productOrganisationSchema, formData);
      if (!parsed.ok) return parsed;
      const { id, expectedUpdatedAt, tags, ...fields } = parsed.data;
      const outcome = await saveProductSection(
        id,
        expectedUpdatedAt,
        {
          section: "organisation",
          ...fields,
          tags: parseTags(tags ?? ""),
        },
        admin.id,
      );
      if (outcome.ok && outcome.data.changed.length > 0) {
        refreshProductPages([outcome.data.slug]);
        revalidatePath(PRODUCTS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/** AdminForm action for the editor's "Pricing" section. */
export async function saveProductPricing(
  _previous: AdminActionResult<ProductSaveOutcome> | null,
  formData: FormData,
): SaveResult {
  return withAdmin<ProductSaveOutcome>(
    "product.pricing",
    async (admin) => {
      const parsed = parseInput(productPricingSchema, formData);
      if (!parsed.ok) return parsed;
      const { id, expectedUpdatedAt, price, compareAtPrice } = parsed.data;
      const outcome = await saveProductSection(
        id,
        expectedUpdatedAt,
        { section: "pricing", price, compareAtPrice },
        admin.id,
      );
      if (outcome.ok && outcome.data.changed.length > 0) {
        refreshProductPages([outcome.data.slug]);
        revalidatePath(PRODUCTS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/** AdminForm action for the editor's "Search engines" section. */
export async function saveProductSeo(
  _previous: AdminActionResult<ProductSaveOutcome> | null,
  formData: FormData,
): SaveResult {
  return withAdmin<ProductSaveOutcome>(
    "product.seo",
    async (admin) => {
      const parsed = parseInput(productSeoSchema, formData);
      if (!parsed.ok) return parsed;
      const { id, expectedUpdatedAt, seoTitle, seoDescription } = parsed.data;
      const outcome = await saveProductSection(
        id,
        expectedUpdatedAt,
        { section: "seo", seoTitle, seoDescription },
        admin.id,
      );
      if (outcome.ok && outcome.data.changed.length > 0) refreshProductPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/* ── Status ─────────────────────────────────────────────────────────────── */

/**
 * Publishes, moves to draft or archives one product. Takes a single argument, for
 * a ConfirmDialog or a plain button: changeProductStatus({ id, expectedStatus, status }).
 */
export async function changeProductStatus(input: unknown): Promise<AdminActionResult<ProductStatusOutcome>> {
  return withAdmin<ProductStatusOutcome>(
    "product.status",
    async (admin) => {
      const parsed = parseInput(productStatusSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await setProductStatus(parsed.data.id, parsed.data.expectedStatus, parsed.data.status, admin.id);
      if (outcome.ok) {
        refreshProductPages([outcome.data.slug]);
        revalidatePath(PRODUCTS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/**
 * The same three steps over the products ticked in the list:
 * bulkChangeProductStatus({ action: "archive", ids: [...] }).
 */
export async function bulkChangeProductStatus(input: unknown): Promise<AdminActionResult<BulkProductOutcome>> {
  return withAdmin<BulkProductOutcome>(
    "products.bulk",
    async (admin) => {
      const parsed = parseInput(bulkProductSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await bulkUpdateProductStatus(
        parsed.data.ids,
        parsed.data.action,
        admin.id,
      );
      if (outcome.ok && outcome.data.changed > 0) {
        refreshProductPages(outcome.data.slugs);
        revalidatePath(PRODUCTS_PATH);
      }
      return outcome.ok ? { ...outcome, message: bulkMessage(outcome.data) } : outcome;
    },
    HEAVY_LIMIT,
  );
}

const BULK_DONE: Record<BulkProductAction, (count: number) => string> = {
  publish: (count) => `Published ${count} ${count === 1 ? "product" : "products"}.`,
  unpublish: (count) => `Moved ${count} ${count === 1 ? "product" : "products"} to draft.`,
  archive: (count) => `Archived ${count} ${count === 1 ? "product" : "products"}.`,
};

/** One plain sentence saying what happened, including what was left alone and why. */
function bulkMessage(outcome: BulkProductOutcome): string {
  const parts: string[] = [];
  if (outcome.changed > 0) parts.push(BULK_DONE[outcome.action](outcome.changed));
  else parts.push("Nothing changed.");

  if (outcome.unchanged > 0) {
    parts.push(`${outcome.unchanged} ${outcome.unchanged === 1 ? "was" : "were"} already like that.`);
  }
  if (outcome.blocked.length > 0) {
    const names = outcome.blocked.slice(0, 3).map((item) => `“${item.name}”`).join(", ");
    const more = outcome.blocked.length > 3 ? ` and ${outcome.blocked.length - 3} more` : "";
    parts.push(
      `${outcome.blocked.length} ${outcome.blocked.length === 1 ? "isn’t" : "aren’t"} ready to publish (${names}${more}) — open each one to see what is missing.`,
    );
  }
  if (outcome.missing > 0) {
    parts.push(`${outcome.missing} ${outcome.missing === 1 ? "was" : "were"} no longer there.`);
  }
  return parts.join(" ");
}

/* ── Deleting ───────────────────────────────────────────────────────────── */

/** AdminForm action for the delete dialog. On success, back to the list with a note. */
export async function deleteProductAction(
  _previous: AdminActionResult<null> | null,
  formData: FormData,
): Promise<AdminActionResult<null>> {
  const result = await withAdmin<{ name: string; slug: string }>(
    "product.delete",
    async (admin) => {
      const parsed = parseInput(deleteProductSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await deleteProduct(parsed.data.id, admin.id);
      if (!outcome.ok) return outcome;
      refreshProductPages([outcome.data.slug]);
      revalidatePath(PRODUCTS_PATH);
      return outcome;
    },
    HEAVY_LIMIT,
  );
  if (result.ok) redirect(`${PRODUCTS_PATH}?deleted=${encodeURIComponent(result.data.name.slice(0, 80))}`);
  return result;
}
