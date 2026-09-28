"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { MOVE_DIRECTIONS, type MoveDirection } from "@/components/admin/collections/ordering";
import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import {
  CATEGORIES_PATH,
  CATEGORY_FIELD_LIMITS,
  createCategory,
  deleteCategory,
  moveCategory,
  updateCategory,
  type CategoryInput,
  type CategoryUpdateOutcome,
} from "@/lib/admin/categories";
import type { ReorderOutcome } from "@/lib/admin/collections";
import { zCheckbox, zId, zOneOf, zText } from "@/lib/admin/validation";

/*
 * Category changes from /admin/categories. Same shape as the collection actions:
 * admin check and rate limit first (withAdmin), zod on every field, one locked
 * transaction with its audit entry (lib/admin/categories), then the storefront
 * catalogue expired and the category's shop pages revalidated.
 */

const WRITE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

const MISSING = "Something is missing from this form. Refresh the page and try again.";

function optionalId(message: string) {
  return z.preprocess(
    (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value),
    zId(message).nullable(),
  );
}

/** The code field is left out of the form when the code is locked: null then means "keep it". */
const optionalCode = z.preprocess(
  (value) => (value === undefined || value === null ? null : value),
  z.string().max(10, "Use exactly three letters (A to Z), e.g. SHR.").nullable(),
);

const detailsSchema = z.object({
  name: zText({ max: CATEGORY_FIELD_LIMITS.name, required: "Enter a name.", label: "The name" }),
  slug: zText({ max: 200, label: "The web address" }),
  code: optionalCode,
  description: zText({
    max: CATEGORY_FIELD_LIMITS.description,
    required: "Write a short description.",
    label: "The description",
  }),
  imageId: optionalId("That photo can’t be used. Choose another."),
  placeAfter: optionalId("Choose a position from the list."),
  originalPlaceAfter: optionalId(MISSING),
  confirmSlugChange: zCheckbox(),
});

type DetailsData = z.output<typeof detailsSchema>;

function toInput(data: DetailsData, keepPositionUnlessChanged: boolean): CategoryInput {
  return {
    name: data.name,
    slug: data.slug,
    code: data.code,
    description: data.description,
    imageId: data.imageId,
    placeAfter: keepPositionUnlessChanged && data.placeAfter === data.originalPlaceAfter ? null : data.placeAfter,
    confirmSlugChange: data.confirmSlugChange,
  };
}

/** Expires the catalogue and the storefront pages a category change can show on. */
function refreshCategoryPages(slugs: readonly (string | null | undefined)[]): void {
  refreshStorefrontCatalog();
  revalidatePath("/");
  revalidatePath("/shop");
  for (const slug of new Set(slugs)) {
    if (slug) revalidatePath(`/shop/${slug}`);
  }
}

/** AdminForm action for /admin/categories/new. On success, opens the new category. */
export async function createCategoryAction(
  _previous: AdminActionResult<{ id: string; slug: string }> | null,
  formData: FormData,
): Promise<AdminActionResult<{ id: string; slug: string }>> {
  const result = await withAdmin<{ id: string; slug: string }>(
    "category.save",
    async (admin) => {
      const parsed = parseInput(detailsSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await createCategory(toInput(parsed.data, false), admin.id);
      if (outcome.ok) refreshCategoryPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
  if (result.ok) redirect(`${CATEGORIES_PATH}/${encodeURIComponent(result.data.id)}?created=1`);
  return result;
}

const updateSchema = detailsSchema.extend({ id: zId(MISSING) });

/** AdminForm action for a category's details form. */
export async function updateCategoryAction(
  _previous: AdminActionResult<CategoryUpdateOutcome> | null,
  formData: FormData,
): Promise<AdminActionResult<CategoryUpdateOutcome>> {
  return withAdmin<CategoryUpdateOutcome>(
    "category.save",
    async (admin) => {
      const parsed = parseInput(updateSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await updateCategory(parsed.data.id, toInput(parsed.data, true), admin.id);
      if (outcome.ok && outcome.data.changed.length > 0) {
        refreshCategoryPages([outcome.data.slug, outcome.data.previousSlug]);
        revalidatePath(CATEGORIES_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

const idSchema = z.object({ id: zId(MISSING) });

/** AdminForm action for the delete dialog. On success, back to the list with a note. */
export async function deleteCategoryAction(
  _previous: AdminActionResult<null> | null,
  formData: FormData,
): Promise<AdminActionResult<null>> {
  const result = await withAdmin<{ name: string; slug: string }>(
    "category.delete",
    async (admin) => {
      const parsed = parseInput(idSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await deleteCategory(parsed.data.id, admin.id);
      if (!outcome.ok) return outcome;
      refreshCategoryPages([outcome.data.slug]);
      return outcome;
    },
    { limit: 20, windowMs: 60_000 },
  );
  if (result.ok) redirect(`${CATEGORIES_PATH}?deleted=${encodeURIComponent(result.data.name.slice(0, 80))}`);
  return result;
}

const moveSchema = z.object({
  id: zId(MISSING),
  direction: zOneOf(MOVE_DIRECTIONS, MISSING),
});

/** Moves a category one place in the shop's order. Bind the id on the server: moveCategoryAction.bind(null, id). */
export async function moveCategoryAction(id: string, direction: MoveDirection): Promise<AdminActionResult<ReorderOutcome>> {
  return withAdmin<ReorderOutcome>(
    "category.reorder",
    async (admin) => {
      const parsed = parseInput(moveSchema, { id, direction });
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await moveCategory(parsed.data.id, parsed.data.direction, admin.id);
      if (outcome.ok) {
        refreshCategoryPages([]);
        revalidatePath(CATEGORIES_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}
