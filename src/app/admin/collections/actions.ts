"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { MOVE_DIRECTIONS, type MoveDirection } from "@/components/admin/collections/ordering";
import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import {
  addPhotoToCollection,
  addPieceToCollection,
  COLLECTION_FIELD_LIMITS,
  COLLECTIONS_PATH,
  createCollection,
  deleteCollection,
  moveCollection,
  movePhotoInCollection,
  movePieceInCollection,
  removePhotoFromCollection,
  removePieceFromCollection,
  searchPiecesForCollection,
  updateCollection,
  type CollectionInput,
  type CollectionUpdateOutcome,
  type PieceChangeOutcome,
  type PhotoChangeOutcome,
  type PieceSearchResult,
  type ReorderOutcome,
} from "@/lib/admin/collections";
import { zCheckbox, zId, zOneOf, zOptionalText, zText } from "@/lib/admin/validation";

/*
 * Collection changes from /admin/collections. Each action: the admin check and a
 * rate limit (withAdmin) before anything else; every field re-validated with zod
 * (bound ids included — nothing from the browser is trusted); then one locked
 * transaction in lib/admin/collections with its audit entry. Afterwards the
 * storefront catalogue is expired (refreshStorefrontCatalog, which also
 * re-renders this admin page) and the affected storefront pages revalidated.
 */

const WRITE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const SEARCH_LIMIT = { limit: 120, windowMs: 60_000 } as const;

const MISSING = "Something is missing from this form. Refresh the page and try again.";

/** "" or a missing field → null; otherwise a well-formed id. */
function optionalId(message: string) {
  return z.preprocess(
    (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value),
    zId(message).nullable(),
  );
}

const detailsSchema = z.object({
  name: zText({ max: COLLECTION_FIELD_LIMITS.name, required: "Enter a name.", label: "The name" }),
  slug: zText({ max: 200, label: "The web address" }),
  code: zOptionalText({ max: COLLECTION_FIELD_LIMITS.code, label: "The code" }),
  season: zOptionalText({ max: COLLECTION_FIELD_LIMITS.season, label: "The season" }),
  summary: zText({
    max: COLLECTION_FIELD_LIMITS.summary,
    required: "Write a one-line summary.",
    label: "The summary",
  }),
  description: zText({
    max: COLLECTION_FIELD_LIMITS.description,
    required: "Write a short description.",
    label: "The description",
  }),
  heroImageId: optionalId("That photo can’t be used. Choose another."),
  isPublished: zCheckbox(),
  isFeatured: zCheckbox(),
  placeAfter: optionalId("Choose a position from the list."),
  originalPlaceAfter: optionalId(MISSING),
  confirmSlugChange: zCheckbox(),
});

type DetailsData = z.output<typeof detailsSchema>;

function toInput(data: DetailsData, keepPositionUnlessChanged: boolean): CollectionInput {
  const placeAfter =
    keepPositionUnlessChanged && data.placeAfter === data.originalPlaceAfter ? null : data.placeAfter;
  return {
    name: data.name,
    slug: data.slug,
    code: data.code,
    season: data.season,
    summary: data.summary,
    description: data.description,
    heroImageId: data.heroImageId,
    isPublished: data.isPublished,
    isFeatured: data.isFeatured,
    placeAfter,
    confirmSlugChange: data.confirmSlugChange,
  };
}

/** Expires the catalogue and the storefront pages a collection change can show on. */
function refreshCollectionPages(slugs: readonly (string | null | undefined)[]): void {
  refreshStorefrontCatalog();
  revalidatePath("/");
  revalidatePath("/collections");
  revalidatePath("/shop");
  for (const slug of new Set(slugs)) {
    if (slug) revalidatePath(`/collections/${slug}`);
  }
}

/* ── Details ──────────────────────────────────────────────────────────── */

/** AdminForm action for /admin/collections/new. On success, opens the new collection. */
export async function createCollectionAction(
  _previous: AdminActionResult<{ id: string; slug: string }> | null,
  formData: FormData,
): Promise<AdminActionResult<{ id: string; slug: string }>> {
  const result = await withAdmin<{ id: string; slug: string }>(
    "collection.save",
    async (admin) => {
      const parsed = parseInput(detailsSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await createCollection(toInput(parsed.data, false), admin.id);
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
  if (result.ok) redirect(`${COLLECTIONS_PATH}/${encodeURIComponent(result.data.id)}?created=1`);
  return result;
}

const updateSchema = detailsSchema.extend({ id: zId(MISSING) });

/** AdminForm action for a collection's details form. */
export async function updateCollectionAction(
  _previous: AdminActionResult<CollectionUpdateOutcome> | null,
  formData: FormData,
): Promise<AdminActionResult<CollectionUpdateOutcome>> {
  return withAdmin<CollectionUpdateOutcome>(
    "collection.save",
    async (admin) => {
      const parsed = parseInput(updateSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await updateCollection(parsed.data.id, toInput(parsed.data, true), admin.id);
      if (outcome.ok && outcome.data.changed.length > 0) {
        refreshCollectionPages([outcome.data.slug, outcome.data.previousSlug]);
        revalidatePath(COLLECTIONS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

const idSchema = z.object({ id: zId(MISSING) });

/** AdminForm action for the delete dialog. On success, back to the list with a note. */
export async function deleteCollectionAction(
  _previous: AdminActionResult<null> | null,
  formData: FormData,
): Promise<AdminActionResult<null>> {
  const result = await withAdmin<{ name: string; slug: string }>(
    "collection.delete",
    async (admin) => {
      const parsed = parseInput(idSchema, formData);
      if (!parsed.ok) return parsed;
      const outcome = await deleteCollection(parsed.data.id, admin.id);
      if (!outcome.ok) return outcome;
      refreshCollectionPages([outcome.data.slug]);
      return { ok: true, data: { name: outcome.data.name, slug: outcome.data.slug } };
    },
    { limit: 20, windowMs: 60_000 },
  );
  if (result.ok) redirect(`${COLLECTIONS_PATH}?deleted=${encodeURIComponent(result.data.name.slice(0, 80))}`);
  return result;
}

const moveSchema = z.object({
  id: zId(MISSING),
  direction: zOneOf(MOVE_DIRECTIONS, MISSING),
});

/** Moves a collection one place in the shop's order. Bind the id on the server: moveCollectionAction.bind(null, id). */
export async function moveCollectionAction(id: string, direction: MoveDirection): Promise<AdminActionResult<ReorderOutcome>> {
  return withAdmin<ReorderOutcome>(
    "collection.reorder",
    async (admin) => {
      const parsed = parseInput(moveSchema, { id, direction });
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await moveCollection(parsed.data.id, parsed.data.direction, admin.id);
      if (outcome.ok) {
        refreshCollectionPages([]);
        revalidatePath(COLLECTIONS_PATH);
      }
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

const searchSchema = z.object({
  collectionId: zId(MISSING),
  q: zText({ max: 100, label: "The search" }),
});

/** Products that could join the collection (not archived, not already in it). */
export async function searchCollectionPiecesAction(input: {
  collectionId: string;
  q: string;
}): Promise<AdminActionResult<PieceSearchResult[]>> {
  return withAdmin<PieceSearchResult[]>(
    "collection.search",
    async () => {
      const parsed = parseInput(searchSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const results = await searchPiecesForCollection(parsed.data.collectionId, parsed.data.q);
      return { ok: true, data: results };
    },
    SEARCH_LIMIT,
  );
}

const pieceSchema = z.object({
  collectionId: zId(MISSING),
  productId: zId(MISSING),
});

export async function addCollectionPieceAction(input: {
  collectionId: string;
  productId: string;
}): Promise<AdminActionResult<PieceChangeOutcome>> {
  return withAdmin<PieceChangeOutcome>(
    "collection.pieces",
    async (admin) => {
      const parsed = parseInput(pieceSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await addPieceToCollection(parsed.data.collectionId, parsed.data.productId, admin.id);
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}

export async function removeCollectionPieceAction(input: {
  collectionId: string;
  productId: string;
}): Promise<AdminActionResult<PieceChangeOutcome>> {
  return withAdmin<PieceChangeOutcome>(
    "collection.pieces",
    async (admin) => {
      const parsed = parseInput(pieceSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await removePieceFromCollection(parsed.data.collectionId, parsed.data.productId, admin.id);
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}

const movePieceSchema = pieceSchema.extend({ direction: zOneOf(MOVE_DIRECTIONS, MISSING) });

/** Bind collectionId and productId on the server: moveCollectionPieceAction.bind(null, collectionId, productId). */
export async function moveCollectionPieceAction(
  collectionId: string,
  productId: string,
  direction: MoveDirection,
): Promise<AdminActionResult<ReorderOutcome>> {
  return withAdmin<ReorderOutcome>(
    "collection.pieces",
    async (admin) => {
      const parsed = parseInput(movePieceSchema, { collectionId, productId, direction });
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await movePieceInCollection(
        parsed.data.collectionId,
        parsed.data.productId,
        parsed.data.direction,
        admin.id,
      );
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}

/* ── Campaign photos ──────────────────────────────────────────────────── */

const photoSchema = z.object({
  collectionId: zId(MISSING),
  mediaId: zId(MISSING),
});

export async function addCollectionPhotoAction(input: {
  collectionId: string;
  mediaId: string;
}): Promise<AdminActionResult<PhotoChangeOutcome>> {
  return withAdmin<PhotoChangeOutcome>(
    "collection.photos",
    async (admin) => {
      const parsed = parseInput(photoSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await addPhotoToCollection(parsed.data.collectionId, parsed.data.mediaId, admin.id);
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}

export async function removeCollectionPhotoAction(input: {
  collectionId: string;
  mediaId: string;
}): Promise<AdminActionResult<PhotoChangeOutcome>> {
  return withAdmin<PhotoChangeOutcome>(
    "collection.photos",
    async (admin) => {
      const parsed = parseInput(photoSchema, input);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await removePhotoFromCollection(parsed.data.collectionId, parsed.data.mediaId, admin.id);
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}

const movePhotoSchema = photoSchema.extend({ direction: zOneOf(MOVE_DIRECTIONS, MISSING) });

/** Bind collectionId and mediaId on the server: moveCollectionPhotoAction.bind(null, collectionId, mediaId). */
export async function moveCollectionPhotoAction(
  collectionId: string,
  mediaId: string,
  direction: MoveDirection,
): Promise<AdminActionResult<ReorderOutcome>> {
  return withAdmin<ReorderOutcome>(
    "collection.photos",
    async (admin) => {
      const parsed = parseInput(movePhotoSchema, { collectionId, mediaId, direction });
      if (!parsed.ok) return { ok: false, message: parsed.message };
      const outcome = await movePhotoInCollection(
        parsed.data.collectionId,
        parsed.data.mediaId,
        parsed.data.direction,
        admin.id,
      );
      if (outcome.ok) refreshCollectionPages([outcome.data.slug]);
      return outcome;
    },
    WRITE_LIMIT,
  );
}
