import "server-only";

import {
  changedPositions,
  moveInOrder,
  placeAfter,
  PLACE_FIRST,
  currentPlaceAfter,
  type MoveDirection,
} from "@/components/admin/collections/ordering";
import { slugify, slugProblem, suggestFreeSlug } from "@/components/admin/collections/slug-rules";
import { Prisma } from "@/generated/prisma/client";
import type { ProductStatus } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import type { AdminActionResult } from "./auth";
import type { AdminMedia } from "./media";
import { isMissingSchemaError } from "./team";

/*
 * Collections for the admin area: reading them for the list and editor, and every
 * change — details, order, the pieces in a collection and its campaign photos.
 *
 * Every write runs in one transaction that first locks what it changes (the
 * collection's row, or every collection row when the order changes), so two
 * admins editing at once take turns instead of overwriting each other. Orders are
 * recomputed from the database inside that lock — never from what the browser
 * last saw — and saved as 0, 1, 2… The audit entry is written in the same
 * transaction. Callers (app/admin/collections/actions.ts) check the admin, parse
 * the input and refresh the storefront afterwards.
 *
 * Deleting a collection removes only the grouping (its ProductCollection and
 * CollectionImage rows cascade); products and photos are untouched.
 */

type Tx = Prisma.TransactionClient;

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

export const COLLECTIONS_PATH = "/admin/collections";

/** Most pieces one collection can hold (far beyond a real collection; guards the reorder writes). */
export const MAX_COLLECTION_PIECES = 400;

/** Most campaign photos per collection. The page shows two; the rest are spares. */
export const MAX_COLLECTION_PHOTOS = 12;

export const COLLECTION_FIELD_LIMITS = {
  name: 80,
  code: 40,
  season: 60,
  summary: 200,
  description: 2000,
} as const;

const COLLECTION_ORDER = [
  { sortOrder: "asc" },
  { name: "asc" },
  { id: "asc" },
] as const satisfies Prisma.CollectionOrderByWithRelationInput[];

const PIECE_ORDER = [
  { position: "asc" },
  { product: { name: "asc" } },
  { productId: "asc" },
] as const satisfies Prisma.ProductCollectionOrderByWithRelationInput[];

const PHOTO_ORDER = [
  { position: "asc" },
  { mediaId: "asc" },
] as const satisfies Prisma.CollectionImageOrderByWithRelationInput[];

/** A product the storefront lists: Live, with at least one photo (lib/catalog/repository.ts). */
const LISTED_PRODUCT = { status: "ACTIVE", images: { some: {} } } as const satisfies Prisma.ProductWhereInput;

/*
 * Enough of a product's photos to pick its thumbnail the way the shop does.
 * `orderBy` is a plain (mutable) array because Prisma's nested relation
 * arguments reject a readonly one; `select` keeps its literal `true`s so the
 * row type is inferred.
 */
const THUMB_IMAGES = {
  orderBy: [{ position: "asc" }, { id: "asc" }] as Prisma.ProductImageOrderByWithRelationInput[],
  take: 8,
  select: { role: true, media: { select: { url: true, alt: true, color: true } } } as const,
};

const MEDIA_SELECT = { id: true, url: true, width: true, height: true, alt: true, color: true } as const;

/* ── Messages ─────────────────────────────────────────────────────────── */

const COLLECTION_GONE = "This collection no longer exists — it may have just been deleted. Go back to the list.";
const NEEDS_MIGRATION =
  "The database needs an update before changes can be saved here. Ask your developer to run “npm run db:deploy”, then try again.";
const CHECK_FIELDS = "Please check the highlighted fields.";

/* ── Shapes ───────────────────────────────────────────────────────────── */

/** Enough of a photo to draw a thumbnail (MediaThumb). */
export interface AdminThumb {
  url: string;
  alt: string;
  color: string;
}

export interface AdminCollectionRow {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  season: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  heroImage: AdminThumb | null;
  /** Every product linked to it, whatever its status. */
  productCount: number;
  /** Linked products the shop lists (Live, with photos). */
  liveProductCount: number;
  photoCount: number;
}

export interface CollectionSibling {
  id: string;
  name: string;
}

export interface AdminCollectionDetail extends Omit<AdminCollectionRow, "heroImage"> {
  summary: string;
  description: string;
  heroImage: AdminMedia | null;
  /** The other collections in order, for the position select. */
  others: CollectionSibling[];
  /** PLACE_FIRST, or the id of the collection just before this one. */
  placeAfter: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionPiece {
  productId: string;
  name: string;
  code: string;
  slug: string;
  status: ProductStatus;
  categoryName: string;
  price: number;
  thumb: AdminThumb | null;
  hasPhotos: boolean;
}

export interface CollectionPhoto extends AdminMedia {
  mediaId: string;
}

export interface PieceSearchResult {
  productId: string;
  name: string;
  code: string;
  status: ProductStatus;
  categoryName: string;
  price: number;
  thumb: AdminThumb | null;
}

/** Where something ended up after a move: 1-based position of `count`. */
export interface ReorderOutcome {
  name: string;
  position: number;
  count: number;
  /** The collection's web address, so the caller can refresh its storefront page. */
  slug: string;
}

function pickThumb(images: readonly { role: string; media: AdminThumb }[]): AdminThumb | null {
  return (images.find((image) => image.role === "PRIMARY") ?? images[0])?.media ?? null;
}

async function liveCountsByCollection(collectionIds?: readonly string[]): Promise<Map<string, number>> {
  const rows = await getDb().productCollection.groupBy({
    by: ["collectionId"],
    where: {
      product: LISTED_PRODUCT,
      ...(collectionIds ? { collectionId: { in: [...collectionIds] } } : {}),
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.collectionId, row._count._all]));
}

/* ── Reading ──────────────────────────────────────────────────────────── */

/** Every collection, in the shop's order, with counts. */
export async function listAdminCollections(): Promise<AdminCollectionRow[]> {
  const [collections, live] = await Promise.all([
    getDb().collection.findMany({
      orderBy: COLLECTION_ORDER,
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        season: true,
        isPublished: true,
        isFeatured: true,
        heroImage: { select: { url: true, alt: true, color: true } },
        _count: { select: { products: true, images: true } },
      },
    }),
    liveCountsByCollection(),
  ]);

  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    code: collection.code,
    season: collection.season,
    isPublished: collection.isPublished,
    isFeatured: collection.isFeatured,
    heroImage: collection.heroImage,
    productCount: collection._count.products,
    liveProductCount: live.get(collection.id) ?? 0,
    photoCount: collection._count.images,
  }));
}

/** Every collection's id and name in order (the "Position" choices for a new one). */
export async function listCollectionOrder(): Promise<CollectionSibling[]> {
  return getDb().collection.findMany({ orderBy: COLLECTION_ORDER, select: { id: true, name: true } });
}

/** Just the name, for page titles. */
export async function getCollectionName(id: string): Promise<string | null> {
  const collection = await getDb().collection.findUnique({ where: { id }, select: { name: true } });
  return collection?.name ?? null;
}

/** One collection with everything its editor shows, or null. */
export async function getAdminCollection(id: string): Promise<AdminCollectionDetail | null> {
  const db = getDb();
  const [collection, order, live] = await Promise.all([
    db.collection.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        season: true,
        summary: true,
        description: true,
        isPublished: true,
        isFeatured: true,
        createdAt: true,
        updatedAt: true,
        heroImage: { select: MEDIA_SELECT },
        _count: { select: { products: true, images: true } },
      },
    }),
    listCollectionOrder(),
    liveCountsByCollection([id]),
  ]);
  if (!collection) return null;

  const ids = order.map((item) => item.id);
  return {
    id: collection.id,
    name: collection.name,
    slug: collection.slug,
    code: collection.code,
    season: collection.season,
    summary: collection.summary,
    description: collection.description,
    isPublished: collection.isPublished,
    isFeatured: collection.isFeatured,
    heroImage: collection.heroImage,
    productCount: collection._count.products,
    liveProductCount: live.get(collection.id) ?? 0,
    photoCount: collection._count.images,
    others: order.filter((item) => item.id !== id),
    placeAfter: currentPlaceAfter(ids, id),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

/** The pieces in a collection, in its saved order. */
export async function listCollectionPieces(collectionId: string): Promise<CollectionPiece[]> {
  const links = await getDb().productCollection.findMany({
    where: { collectionId },
    orderBy: PIECE_ORDER,
    select: {
      product: {
        select: {
          id: true,
          name: true,
          code: true,
          slug: true,
          status: true,
          price: true,
          category: { select: { name: true } },
          images: THUMB_IMAGES,
        },
      },
    },
  });
  return links.map(({ product }) => ({
    productId: product.id,
    name: product.name,
    code: product.code,
    slug: product.slug,
    status: product.status,
    categoryName: product.category.name,
    price: product.price,
    thumb: pickThumb(product.images),
    hasPhotos: product.images.length > 0,
  }));
}

/** A collection's campaign photos, in order. */
export async function listCollectionPhotos(collectionId: string): Promise<CollectionPhoto[]> {
  const links = await getDb().collectionImage.findMany({
    where: { collectionId },
    orderBy: PHOTO_ORDER,
    select: { media: { select: MEDIA_SELECT } },
  });
  return links.map(({ media }) => ({ ...media, mediaId: media.id }));
}

/** "TBT-SHR-KPL-SND-M" → "KPL": a pasted SKU finds its product. */
function productCodeFromSku(query: string): string | null {
  const match = /^tbt-[a-z]{3}-([a-z0-9]{2,8})(?:-|$)/i.exec(query.trim());
  return match ? match[1].toUpperCase() : null;
}

/**
 * Products that could be added to a collection: not archived, not already in it,
 * matching `query` by name, product code, web address or a pasted SKU. With no
 * query, the most recently changed products.
 */
export async function searchPiecesForCollection(
  collectionId: string,
  query: string,
  limit = 10,
): Promise<PieceSearchResult[]> {
  const q = query.trim().slice(0, 100);
  const slugQuery = slugify(q);
  const skuCode = productCodeFromSku(q);
  const matches: Prisma.ProductWhereInput[] = q
    ? [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        ...(slugQuery ? [{ slug: { contains: slugQuery } }] : []),
        ...(skuCode ? [{ code: skuCode }] : []),
      ]
    : [];

  const products = await getDb().product.findMany({
    where: {
      status: { not: "ARCHIVED" },
      collections: { none: { collectionId } },
      ...(matches.length > 0 ? { OR: matches } : {}),
    },
    orderBy: q ? [{ name: "asc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "asc" }],
    take: Math.min(Math.max(1, limit), 25),
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      price: true,
      category: { select: { name: true } },
      images: THUMB_IMAGES,
    },
  });

  return products.map((product) => ({
    productId: product.id,
    name: product.name,
    code: product.code,
    status: product.status,
    categoryName: product.category.name,
    price: product.price,
    thumb: pickThumb(product.images),
  }));
}

/* ── Shared write helpers ─────────────────────────────────────────────── */

function prismaCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

/** Turns a database failure into an owner-facing result, or rethrows the unexpected. */
function knownFailure(error: unknown): { ok: false; message: string } | null {
  if (isMissingSchemaError(error)) return { ok: false, message: NEEDS_MIGRATION };
  return null;
}

/** Locks one collection row for the rest of the transaction. */
async function lockCollection(tx: Tx, id: string): Promise<{ id: string; name: string; slug: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; name: string; slug: string }[]>`
    SELECT "id", "name", "slug" FROM "Collection" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Locks every collection row (the whole order), in id order so concurrent callers can't deadlock. */
async function lockAllCollections(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Collection" ORDER BY "id" FOR UPDATE`;
}

async function saveCollectionOrder(tx: Tx, ordered: readonly string[], current: ReadonlyMap<string, number>) {
  const changes = changedPositions(ordered, current);
  if (changes.length === 0) return;
  const values = Prisma.join(changes.map(([id, position]) => Prisma.sql`(${id}::text, ${position}::int)`));
  await tx.$executeRaw`
    UPDATE "Collection" AS c SET "sortOrder" = v.pos
    FROM (VALUES ${values}) AS v(id, pos)
    WHERE c."id" = v.id`;
}

async function savePieceOrder(
  tx: Tx,
  collectionId: string,
  ordered: readonly string[],
  current: ReadonlyMap<string, number>,
) {
  const changes = changedPositions(ordered, current);
  if (changes.length === 0) return;
  const values = Prisma.join(changes.map(([id, position]) => Prisma.sql`(${id}::text, ${position}::int)`));
  await tx.$executeRaw`
    UPDATE "ProductCollection" AS pc SET "position" = v.pos
    FROM (VALUES ${values}) AS v(id, pos)
    WHERE pc."collectionId" = ${collectionId} AND pc."productId" = v.id`;
}

async function savePhotoOrder(
  tx: Tx,
  collectionId: string,
  ordered: readonly string[],
  current: ReadonlyMap<string, number>,
) {
  const changes = changedPositions(ordered, current);
  if (changes.length === 0) return;
  const values = Prisma.join(changes.map(([id, position]) => Prisma.sql`(${id}::text, ${position}::int)`));
  await tx.$executeRaw`
    UPDATE "CollectionImage" AS ci SET "position" = v.pos
    FROM (VALUES ${values}) AS v(id, pos)
    WHERE ci."collectionId" = ${collectionId} AND ci."mediaId" = v.id`;
}

async function readCollectionOrder(tx: Tx) {
  const rows = await tx.collection.findMany({
    orderBy: COLLECTION_ORDER,
    select: { id: true, name: true, slug: true, sortOrder: true },
  });
  return {
    rows,
    ids: rows.map((row) => row.id),
    positions: new Map(rows.map((row) => [row.id, row.sortOrder])),
  };
}

/* ── Details: create, update, delete ──────────────────────────────────── */

export interface CollectionInput {
  name: string;
  /** As typed ("" = make one from the name); cleaned with slugify. */
  slug: string;
  code: string | null;
  season: string | null;
  summary: string;
  description: string;
  heroImageId: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  /** PLACE_FIRST or the id to follow; null leaves the position as it is (new ones go last). */
  placeAfter: string | null;
  /** The owner ticked "I understand the old address will stop working". */
  confirmSlugChange: boolean;
}

type FieldFailure = { ok: false; message: string; fieldErrors: Record<string, string> };

function fieldFailure(field: string, message: string, rootMessage = CHECK_FIELDS): FieldFailure {
  return { ok: false, message: rootMessage, fieldErrors: { [field]: message } };
}

/** Friendly checks inside the transaction; the unique index still has the final say. */
async function checkCollectionClashes(
  tx: Tx,
  input: { name: string; slug: string; heroImageId: string | null },
  selfId: string | null,
): Promise<FieldFailure | null> {
  const notSelf = selfId ? { id: { not: selfId } } : {};
  // One after another: queries on a transaction share its single connection.
  const slugOwner = await tx.collection.findFirst({ where: { slug: input.slug, ...notSelf }, select: { name: true } });
  const nameOwner = await tx.collection.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" }, ...notSelf },
    select: { name: true },
  });
  const hero = input.heroImageId
    ? await tx.media.findUnique({ where: { id: input.heroImageId }, select: { id: true } })
    : null;

  const fieldErrors: Record<string, string> = {};
  if (slugOwner) fieldErrors.slug = await slugTakenMessage(tx, input.slug, slugOwner.name);
  if (nameOwner) fieldErrors.name = `Another collection is already called “${nameOwner.name}”. Choose a different name.`;
  if (input.heroImageId && !hero) {
    fieldErrors.heroImageId = "That photo is no longer in the library. Choose another.";
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, message: CHECK_FIELDS, fieldErrors } : null;
}

async function slugTakenMessage(db: Tx, slug: string, ownerName: string): Promise<string> {
  const taken = await db.collection.findMany({
    where: { slug: { startsWith: slug } },
    select: { slug: true },
  });
  const suggestion = suggestFreeSlug(slug, taken.map((row) => row.slug));
  return `“${ownerName}” already uses /collections/${slug}. Try ${suggestion}.`;
}

/** After a unique-index clash outside the friendly checks (two saves at once): name the field. */
async function explainSlugClash(slug: string, selfId: string | null): Promise<FieldFailure | null> {
  const owner = await getDb().collection.findFirst({
    where: { slug, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { name: true },
  });
  if (!owner) return null;
  return fieldFailure("slug", await slugTakenMessage(getDb(), slug, owner.name));
}

function cleanSlug(input: CollectionInput): { ok: true; slug: string } | FieldFailure {
  const slug = slugify(input.slug || input.name);
  const problem = slugProblem(slug, "collection");
  return problem ? fieldFailure("slug", problem) : { ok: true, slug };
}

function describeCollection(input: { name: string; code: string | null; season: string | null }): string {
  const extra = [input.code, input.season].filter(Boolean).join(", ");
  return extra ? `“${input.name}” (${extra})` : `“${input.name}”`;
}

/** Creates a collection. Its web address is made from the name when left empty. */
export async function createCollection(
  input: CollectionInput,
  actorId: string,
): Promise<AdminActionResult<{ id: string; slug: string }>> {
  const cleaned = cleanSlug(input);
  if (!cleaned.ok) return cleaned;
  const slug = cleaned.slug;

  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<{ id: string; slug: string }>> => {
      await lockAllCollections(tx);
      const clash = await checkCollectionClashes(tx, { name: input.name, slug, heroImageId: input.heroImageId }, null);
      if (clash) return clash;

      const before = await readCollectionOrder(tx);
      const created = await tx.collection.create({
        data: {
          name: input.name,
          slug,
          code: input.code,
          season: input.season,
          summary: input.summary,
          description: input.description,
          heroImageId: input.heroImageId,
          isPublished: input.isPublished,
          isFeatured: input.isFeatured,
          sortOrder: before.ids.length,
        },
        select: { id: true },
      });

      const ordered = placeAfter(before.ids, created.id, input.placeAfter ?? before.ids.at(-1) ?? PLACE_FIRST);
      await saveCollectionOrder(tx, ordered, new Map([...before.positions, [created.id, before.ids.length]]));

      await recordAudit({
        tx,
        actorId,
        action: "collection.create",
        entityType: "Collection",
        entityId: created.id,
        summary: `Created the collection ${describeCollection(input)}${input.isPublished ? "" : ", hidden for now"}.`,
        metadata: { slug, isPublished: input.isPublished, isFeatured: input.isFeatured },
      });
      return { ok: true, data: { id: created.id, slug }, message: "Collection created." };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      const explained = await explainSlugClash(slug, null);
      if (explained) return explained;
    }
    if (prismaCode(error) === "P2003") {
      return fieldFailure("heroImageId", "That photo was removed from the library a moment ago. Choose another.");
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

export interface CollectionUpdateOutcome {
  id: string;
  slug: string;
  previousSlug: string;
  changed: string[];
}

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  slug: "web address",
  code: "code",
  season: "season",
  summary: "summary",
  description: "description",
  heroImageId: "large photo",
  isPublished: "shown in the shop",
  isFeatured: "featured",
  position: "position",
};

/** Saves a collection's details (and, when chosen, its position). */
export async function updateCollection(
  id: string,
  input: CollectionInput,
  actorId: string,
): Promise<AdminActionResult<CollectionUpdateOutcome>> {
  const cleaned = cleanSlug(input);
  if (!cleaned.ok) return cleaned;
  const slug = cleaned.slug;
  const repositioning = input.placeAfter !== null;

  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<CollectionUpdateOutcome>> => {
      if (repositioning) await lockAllCollections(tx);
      const locked = await lockCollection(tx, id);
      if (!locked) return { ok: false, message: COLLECTION_GONE };

      const current = await tx.collection.findUniqueOrThrow({
        where: { id },
        select: {
          name: true,
          slug: true,
          code: true,
          season: true,
          summary: true,
          description: true,
          heroImageId: true,
          isPublished: true,
          isFeatured: true,
        },
      });

      if (slug !== current.slug && !input.confirmSlugChange) {
        return fieldFailure(
          "confirmSlugChange",
          "Tick the box to confirm changing the web address.",
          "Changing the web address needs your confirmation.",
        );
      }

      const clash = await checkCollectionClashes(tx, { name: input.name, slug, heroImageId: input.heroImageId }, id);
      if (clash) return clash;

      const next = {
        name: input.name,
        slug,
        code: input.code,
        season: input.season,
        summary: input.summary,
        description: input.description,
        heroImageId: input.heroImageId,
        isPublished: input.isPublished,
        isFeatured: input.isFeatured,
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);

      let moved = false;
      if (repositioning) {
        const order = await readCollectionOrder(tx);
        const ordered = placeAfter(order.ids, id, input.placeAfter ?? PLACE_FIRST);
        moved = ordered.some((otherId, index) => order.ids[index] !== otherId);
        if (moved) await saveCollectionOrder(tx, ordered, order.positions);
      }

      if (changed.length === 0 && !moved) {
        return {
          ok: true,
          data: { id, slug, previousSlug: current.slug, changed: [] },
          message: "Nothing had changed, so there was nothing to save.",
        };
      }

      if (changed.length > 0) await tx.collection.update({ where: { id }, data: next, select: { id: true } });

      const changedLabels = [...changed, ...(moved ? ["position"] : [])].map((key) => FIELD_LABELS[key] ?? key);
      const slugNote = changed.includes("slug") ? ` (web address ${current.slug} → ${slug})` : "";
      await recordAudit({
        tx,
        actorId,
        action: "collection.update",
        entityType: "Collection",
        entityId: id,
        summary: `Updated the collection “${input.name}”: ${changedLabels.join(", ")}${slugNote}.`,
        metadata: {
          changed: changedLabels,
          ...(changed.includes("slug") ? { previousSlug: current.slug, slug } : {}),
          ...(changed.includes("isPublished") ? { isPublished: input.isPublished } : {}),
          ...(changed.includes("isFeatured") ? { isFeatured: input.isFeatured } : {}),
        },
      });

      return {
        ok: true,
        data: { id, slug, previousSlug: current.slug, changed: changedLabels },
        message: "Collection saved.",
      };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      const explained = await explainSlugClash(slug, id);
      if (explained) return explained;
    }
    if (prismaCode(error) === "P2003") {
      return fieldFailure("heroImageId", "That photo was removed from the library a moment ago. Choose another.");
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

export interface DeletedCollection {
  name: string;
  slug: string;
  productCount: number;
}

/** Deletes a collection: the grouping and its page only, never its products or photos. */
export async function deleteCollection(id: string, actorId: string): Promise<AdminActionResult<DeletedCollection>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<DeletedCollection>> => {
      const locked = await lockCollection(tx, id);
      if (!locked) return { ok: false, message: COLLECTION_GONE };
      const productCount = await tx.productCollection.count({ where: { collectionId: id } });
      await tx.collection.delete({ where: { id }, select: { id: true } });
      await recordAudit({
        tx,
        actorId,
        action: "collection.delete",
        entityType: "Collection",
        entityId: id,
        summary:
          productCount > 0
            ? `Deleted the collection “${locked.name}”. Its ${productCount} ${productCount === 1 ? "piece stays" : "pieces stay"} in the shop.`
            : `Deleted the collection “${locked.name}”.`,
        metadata: { name: locked.name, slug: locked.slug, productCount },
      });
      return {
        ok: true,
        data: { name: locked.name, slug: locked.slug, productCount },
        message: `Deleted “${locked.name}”.`,
      };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** Moves a collection one place up or down in the shop's order. */
export async function moveCollection(
  id: string,
  direction: MoveDirection,
  actorId: string,
): Promise<AdminActionResult<ReorderOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<ReorderOutcome>> => {
      await lockAllCollections(tx);
      const order = await readCollectionOrder(tx);
      const row = order.rows.find((item) => item.id === id);
      if (!row) return { ok: false, message: COLLECTION_GONE };
      const slug = row.slug;

      const ordered = moveInOrder(order.ids, id, direction);
      if (!ordered) {
        const position = order.ids.indexOf(id) + 1;
        return {
          ok: true,
          data: { name: row.name, position, count: order.ids.length, slug },
          message: `“${row.name}” is already ${direction === "up" ? "first" : "last"}.`,
        };
      }
      await saveCollectionOrder(tx, ordered, order.positions);
      const position = ordered.indexOf(id) + 1;
      await recordAudit({
        tx,
        actorId,
        action: "collections.reorder",
        entityType: "Collection",
        entityId: id,
        summary: `Moved the collection “${row.name}” ${direction} to position ${position} of ${ordered.length}.`,
        metadata: { direction, position },
      });
      return { ok: true, data: { name: row.name, position, count: ordered.length, slug } };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/* ── Pieces in a collection ───────────────────────────────────────────── */

async function readPieceOrder(tx: Tx, collectionId: string) {
  const rows = await tx.productCollection.findMany({
    where: { collectionId },
    orderBy: PIECE_ORDER,
    select: { productId: true, position: true, product: { select: { name: true } } },
  });
  return {
    rows,
    ids: rows.map((row) => row.productId),
    positions: new Map(rows.map((row) => [row.productId, row.position])),
  };
}

export interface PieceChangeOutcome {
  productName: string;
  collectionName: string;
  slug: string;
  count: number;
}

/** Adds a product to the end of a collection. */
export async function addPieceToCollection(
  collectionId: string,
  productId: string,
  actorId: string,
): Promise<AdminActionResult<PieceChangeOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<PieceChangeOutcome>> => {
      const collection = await lockCollection(tx, collectionId);
      if (!collection) return { ok: false, message: COLLECTION_GONE };

      const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true } });
      if (!product) return { ok: false, message: "That product no longer exists. Search again." };

      const order = await readPieceOrder(tx, collectionId);
      if (order.positions.has(productId)) {
        return { ok: false, message: `“${product.name}” is already in this collection.` };
      }
      if (order.ids.length >= MAX_COLLECTION_PIECES) {
        return {
          ok: false,
          message: `A collection can hold up to ${MAX_COLLECTION_PIECES} pieces. Remove some before adding more.`,
        };
      }

      await tx.productCollection.create({
        data: { collectionId, productId, position: order.ids.length },
        select: { productId: true },
      });
      await savePieceOrder(tx, collectionId, order.ids, order.positions);

      await recordAudit({
        tx,
        actorId,
        action: "collection.products.add",
        entityType: "Collection",
        entityId: collectionId,
        summary: `Added “${product.name}” to the collection “${collection.name}”.`,
        metadata: { productId },
      });
      return {
        ok: true,
        data: {
          productName: product.name,
          collectionName: collection.name,
          slug: collection.slug,
          count: order.ids.length + 1,
        },
        message: `Added “${product.name}” to ${collection.name}.`,
      };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") return { ok: false, message: "That piece is already in this collection." };
    if (prismaCode(error) === "P2003") return { ok: false, message: "That product no longer exists. Search again." };
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** Takes a product out of a collection. The product itself is untouched. */
export async function removePieceFromCollection(
  collectionId: string,
  productId: string,
  actorId: string,
): Promise<AdminActionResult<PieceChangeOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<PieceChangeOutcome>> => {
      const collection = await lockCollection(tx, collectionId);
      if (!collection) return { ok: false, message: COLLECTION_GONE };

      const order = await readPieceOrder(tx, collectionId);
      const row = order.rows.find((item) => item.productId === productId);
      if (!row) {
        return {
          ok: true,
          data: { productName: "", collectionName: collection.name, slug: collection.slug, count: order.ids.length },
          message: "That piece had already been taken out of this collection.",
        };
      }

      await tx.productCollection.delete({
        where: { productId_collectionId: { productId, collectionId } },
        select: { productId: true },
      });
      const remaining = order.ids.filter((id) => id !== productId);
      await savePieceOrder(tx, collectionId, remaining, order.positions);

      await recordAudit({
        tx,
        actorId,
        action: "collection.products.remove",
        entityType: "Collection",
        entityId: collectionId,
        summary: `Took “${row.product.name}” out of the collection “${collection.name}”.`,
        metadata: { productId },
      });
      return {
        ok: true,
        data: {
          productName: row.product.name,
          collectionName: collection.name,
          slug: collection.slug,
          count: remaining.length,
        },
        message: `Took “${row.product.name}” out of ${collection.name}. The product is still in the shop.`,
      };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** Moves a product one place up or down within a collection. */
export async function movePieceInCollection(
  collectionId: string,
  productId: string,
  direction: MoveDirection,
  actorId: string,
): Promise<AdminActionResult<ReorderOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<ReorderOutcome>> => {
      const collection = await lockCollection(tx, collectionId);
      if (!collection) return { ok: false, message: COLLECTION_GONE };

      const order = await readPieceOrder(tx, collectionId);
      const row = order.rows.find((item) => item.productId === productId);
      if (!row) {
        return { ok: false, message: "That piece is no longer in this collection. Refresh the page to see it as it is now." };
      }
      const ordered = moveInOrder(order.ids, productId, direction);
      if (!ordered) {
        return {
          ok: true,
          data: { name: row.product.name, position: order.ids.indexOf(productId) + 1, count: order.ids.length, slug: collection.slug },
          message: `“${row.product.name}” is already ${direction === "up" ? "first" : "last"}.`,
        };
      }
      await savePieceOrder(tx, collectionId, ordered, order.positions);
      const position = ordered.indexOf(productId) + 1;
      await recordAudit({
        tx,
        actorId,
        action: "collection.products.reorder",
        entityType: "Collection",
        entityId: collectionId,
        summary: `Moved “${row.product.name}” ${direction} to position ${position} of ${ordered.length} in the collection “${collection.name}”.`,
        metadata: { productId, direction, position },
      });
      return { ok: true, data: { name: row.product.name, position, count: ordered.length, slug: collection.slug } };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/* ── Campaign photos ──────────────────────────────────────────────────── */

async function readPhotoOrder(tx: Tx, collectionId: string) {
  const rows = await tx.collectionImage.findMany({
    where: { collectionId },
    orderBy: PHOTO_ORDER,
    select: { mediaId: true, position: true, media: { select: { alt: true } } },
  });
  return {
    rows,
    ids: rows.map((row) => row.mediaId),
    positions: new Map(rows.map((row) => [row.mediaId, row.position])),
  };
}

export interface PhotoChangeOutcome {
  collectionName: string;
  slug: string;
  count: number;
}

function photoLabel(alt: string): string {
  const text = alt.trim();
  if (!text) return "a photo";
  return `“${text.length > 60 ? `${text.slice(0, 57)}…` : text}”`;
}

/** Adds a library photo to the end of a collection's campaign photos. */
export async function addPhotoToCollection(
  collectionId: string,
  mediaId: string,
  actorId: string,
): Promise<AdminActionResult<PhotoChangeOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<PhotoChangeOutcome>> => {
      const collection = await lockCollection(tx, collectionId);
      if (!collection) return { ok: false, message: COLLECTION_GONE };

      const media = await tx.media.findUnique({ where: { id: mediaId }, select: { alt: true } });
      if (!media) return { ok: false, message: "That photo is no longer in the library. Choose another." };

      const order = await readPhotoOrder(tx, collectionId);
      if (order.positions.has(mediaId)) return { ok: false, message: "That photo is already in this collection." };
      if (order.ids.length >= MAX_COLLECTION_PHOTOS) {
        return {
          ok: false,
          message: `A collection can have up to ${MAX_COLLECTION_PHOTOS} campaign photos. Remove one before adding another.`,
        };
      }

      await tx.collectionImage.create({
        data: { collectionId, mediaId, position: order.ids.length },
        select: { mediaId: true },
      });
      await savePhotoOrder(tx, collectionId, order.ids, order.positions);
      await recordAudit({
        tx,
        actorId,
        action: "collection.photo.add",
        entityType: "Collection",
        entityId: collectionId,
        summary: `Added ${photoLabel(media.alt)} to the campaign photos of “${collection.name}”.`,
        metadata: { mediaId },
      });
      return {
        ok: true,
        data: { collectionName: collection.name, slug: collection.slug, count: order.ids.length + 1 },
        message: "Photo added.",
      };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") return { ok: false, message: "That photo is already in this collection." };
    if (prismaCode(error) === "P2003") {
      return { ok: false, message: "That photo was removed from the library a moment ago. Choose another." };
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** Takes a photo out of a collection's campaign photos (it stays in the library). */
export async function removePhotoFromCollection(
  collectionId: string,
  mediaId: string,
  actorId: string,
): Promise<AdminActionResult<PhotoChangeOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<PhotoChangeOutcome>> => {
      const collection = await lockCollection(tx, collectionId);
      if (!collection) return { ok: false, message: COLLECTION_GONE };

      const order = await readPhotoOrder(tx, collectionId);
      const row = order.rows.find((item) => item.mediaId === mediaId);
      if (!row) {
        return {
          ok: true,
          data: { collectionName: collection.name, slug: collection.slug, count: order.ids.length },
          message: "That photo had already been taken out of this collection.",
        };
      }
      await tx.collectionImage.delete({
        where: { collectionId_mediaId: { collectionId, mediaId } },
        select: { mediaId: true },
      });
      const remaining = order.ids.filter((id) => id !== mediaId);
      await savePhotoOrder(tx, collectionId, remaining, order.positions);
      await recordAudit({
        tx,
        actorId,
        action: "collection.photo.remove",
        entityType: "Collection",
        entityId: collectionId,
        summary: `Took ${photoLabel(row.media.alt)} out of the campaign photos of “${collection.name}”.`,
        metadata: { mediaId },
      });
      return {
        ok: true,
        data: { collectionName: collection.name, slug: collection.slug, count: remaining.length },
        message: "Photo taken out of the collection. It’s still in the library.",
      };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** Moves a campaign photo one place up or down. */
export async function movePhotoInCollection(
  collectionId: string,
  mediaId: string,
  direction: MoveDirection,
  actorId: string,
): Promise<AdminActionResult<ReorderOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<ReorderOutcome>> => {
      const collection = await lockCollection(tx, collectionId);
      if (!collection) return { ok: false, message: COLLECTION_GONE };

      const order = await readPhotoOrder(tx, collectionId);
      const row = order.rows.find((item) => item.mediaId === mediaId);
      if (!row) {
        return { ok: false, message: "That photo is no longer in this collection. Refresh the page to see it as it is now." };
      }
      const name = row.media.alt.trim() || "Photo";
      const ordered = moveInOrder(order.ids, mediaId, direction);
      if (!ordered) {
        return {
          ok: true,
          data: { name, position: order.ids.indexOf(mediaId) + 1, count: order.ids.length, slug: collection.slug },
          message: `That photo is already ${direction === "up" ? "first" : "last"}.`,
        };
      }
      await savePhotoOrder(tx, collectionId, ordered, order.positions);
      const position = ordered.indexOf(mediaId) + 1;
      await recordAudit({
        tx,
        actorId,
        action: "collection.photo.move",
        entityType: "Collection",
        entityId: collectionId,
        summary: `Moved ${photoLabel(row.media.alt)} ${direction} to position ${position} of ${ordered.length} in the campaign photos of “${collection.name}”.`,
        metadata: { mediaId, direction, position },
      });
      return { ok: true, data: { name, position, count: ordered.length, slug: collection.slug } };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}
