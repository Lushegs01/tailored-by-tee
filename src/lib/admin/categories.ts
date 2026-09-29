import "server-only";

import { categoryCodeProblem, normaliseCategoryCode } from "@/components/admin/categories/category-code";
import {
  changedPositions,
  currentPlaceAfter,
  moveInOrder,
  placeAfter,
  PLACE_FIRST,
  type MoveDirection,
} from "@/components/admin/collections/ordering";
import { slugify, slugProblem, suggestFreeSlug } from "@/components/admin/collections/slug-rules";
import { Prisma } from "@/generated/prisma/client";
import type { ProductStatus } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import type { AdminActionResult } from "./auth";
import type { AdminThumb, ReorderOutcome } from "./collections";
import type { AdminMedia } from "./media";
import { isMissingSchemaError } from "./team";

/*
 * Categories for the admin area: the Shop menu's sections and the second part of
 * every SKU ("TBT-SHR-…"). Reads for the list and editor, and every change.
 *
 * Like collections, each write locks what it changes first (the category row,
 * or every category row when the order changes), recomputes any order from the
 * database, and writes its audit entry in the same transaction.
 *
 * Two rules protect data elsewhere:
 * - The code can't change once any product in the category has variants: their
 *   SKUs contain it. Checked with the category row locked, so the check and the
 *   change can't be split by another save. (The variants editor should read the
 *   code with the row shared-locked when building SKUs; see the slice report.)
 * - A category is deleted only when no product uses it (the database refuses
 *   otherwise: Product.categoryId is ON DELETE RESTRICT) and no discount is
 *   limited to it (those rows would cascade away, silently widening the discount).
 *   New products or discount links wait for the row lock, so the counts taken
 *   under it are final.
 */

type Tx = Prisma.TransactionClient;

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

export const CATEGORIES_PATH = "/admin/categories";

export const CATEGORY_FIELD_LIMITS = {
  name: 60,
  description: 500,
} as const;

const CATEGORY_ORDER = [
  { sortOrder: "asc" },
  { name: "asc" },
  { id: "asc" },
] as const satisfies Prisma.CategoryOrderByWithRelationInput[];

/** A product the storefront lists: Live, with at least one photo (lib/catalog/repository.ts). */
const LISTED_PRODUCT = { status: "ACTIVE", images: { some: {} } } as const satisfies Prisma.ProductWhereInput;

const MEDIA_SELECT = { id: true, url: true, width: true, height: true, alt: true, color: true } as const;

const CATEGORY_GONE = "This category no longer exists — it may have just been deleted. Go back to the list.";
const NEEDS_MIGRATION =
  "The database needs an update before changes can be saved here. Ask your developer to run “npm run db:deploy”, then try again.";
const CHECK_FIELDS = "Please check the highlighted fields.";

/* ── Shapes ───────────────────────────────────────────────────────────── */

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  code: string;
  image: AdminThumb | null;
  /** Every product in it, whatever its status. */
  productCount: number;
  /** Its products the shop lists (Live, with photos). */
  liveProductCount: number;
}

export interface CategorySibling {
  id: string;
  name: string;
}

export interface CategoryProductPreview {
  id: string;
  name: string;
  code: string;
  status: ProductStatus;
}

export interface AdminCategoryDetail extends Omit<AdminCategoryRow, "image"> {
  description: string;
  image: AdminMedia | null;
  /** Variants (SKUs) of products in this category; above zero locks the code. */
  variantCount: number;
  /** Codes of discounts limited to this category. */
  couponCodes: string[];
  /** A few of its products, newest change first. */
  products: CategoryProductPreview[];
  others: CategorySibling[];
  placeAfter: string;
  createdAt: Date;
  updatedAt: Date;
}

async function liveCountsByCategory(categoryIds?: readonly string[]): Promise<Map<string, number>> {
  const rows = await getDb().product.groupBy({
    by: ["categoryId"],
    where: { ...LISTED_PRODUCT, ...(categoryIds ? { categoryId: { in: [...categoryIds] } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.categoryId, row._count._all]));
}

/* ── Reading ──────────────────────────────────────────────────────────── */

/** Every category, in the shop's order, with counts. */
export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  const [categories, live] = await Promise.all([
    getDb().category.findMany({
      orderBy: CATEGORY_ORDER,
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        image: { select: { url: true, alt: true, color: true } },
        _count: { select: { products: true } },
      },
    }),
    liveCountsByCategory(),
  ]);
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    code: category.code,
    image: category.image,
    productCount: category._count.products,
    liveProductCount: live.get(category.id) ?? 0,
  }));
}

/** Every category's id and name in order (the "Position" choices for a new one). */
export async function listCategoryOrder(): Promise<CategorySibling[]> {
  return getDb().category.findMany({ orderBy: CATEGORY_ORDER, select: { id: true, name: true } });
}

/** Codes already in use, so the form can suggest a free one. */
export async function listCategoryCodes(): Promise<string[]> {
  const rows = await getDb().category.findMany({ select: { code: true } });
  return rows.map((row) => row.code);
}

/** Just the name, for page titles. */
export async function getCategoryName(id: string): Promise<string | null> {
  const category = await getDb().category.findUnique({ where: { id }, select: { name: true } });
  return category?.name ?? null;
}

/** One category with everything its editor shows, or null. */
export async function getAdminCategory(id: string): Promise<AdminCategoryDetail | null> {
  const db = getDb();
  const [category, order, live, variantCount, coupons] = await Promise.all([
    db.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        image: { select: MEDIA_SELECT },
        _count: { select: { products: true } },
        products: {
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: 8,
          select: { id: true, name: true, code: true, status: true },
        },
      },
    }),
    listCategoryOrder(),
    liveCountsByCategory([id]),
    db.productVariant.count({ where: { product: { categoryId: id } } }),
    db.couponCategory.findMany({
      where: { categoryId: id },
      orderBy: { coupon: { code: "asc" } },
      select: { coupon: { select: { code: true } } },
    }),
  ]);
  if (!category) return null;

  const ids = order.map((item) => item.id);
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    code: category.code,
    description: category.description,
    image: category.image,
    productCount: category._count.products,
    liveProductCount: live.get(category.id) ?? 0,
    variantCount,
    couponCodes: coupons.map((link) => link.coupon.code),
    products: category.products,
    others: order.filter((item) => item.id !== id),
    placeAfter: currentPlaceAfter(ids, id),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/* ── Write helpers ────────────────────────────────────────────────────── */

type FieldFailure = { ok: false; message: string; fieldErrors: Record<string, string> };

function fieldFailure(field: string, message: string, rootMessage = CHECK_FIELDS): FieldFailure {
  return { ok: false, message: rootMessage, fieldErrors: { [field]: message } };
}

function prismaCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

function knownFailure(error: unknown): { ok: false; message: string } | null {
  if (isMissingSchemaError(error)) return { ok: false, message: NEEDS_MIGRATION };
  return null;
}

async function lockCategory(
  tx: Tx,
  id: string,
): Promise<{ id: string; name: string; slug: string; code: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; name: string; slug: string; code: string }[]>`
    SELECT "id", "name", "slug", "code" FROM "Category" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

async function lockAllCategories(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Category" ORDER BY "id" FOR UPDATE`;
}

async function readCategoryOrder(tx: Tx) {
  const rows = await tx.category.findMany({
    orderBy: CATEGORY_ORDER,
    select: { id: true, name: true, slug: true, sortOrder: true },
  });
  return {
    rows,
    ids: rows.map((row) => row.id),
    positions: new Map(rows.map((row) => [row.id, row.sortOrder])),
  };
}

async function saveCategoryOrder(tx: Tx, ordered: readonly string[], current: ReadonlyMap<string, number>) {
  const changes = changedPositions(ordered, current);
  if (changes.length === 0) return;
  const values = Prisma.join(changes.map(([id, position]) => Prisma.sql`(${id}::text, ${position}::int)`));
  await tx.$executeRaw`
    UPDATE "Category" AS c SET "sortOrder" = v.pos
    FROM (VALUES ${values}) AS v(id, pos)
    WHERE c."id" = v.id`;
}

async function slugTakenMessage(db: Tx, slug: string, ownerName: string): Promise<string> {
  const taken = await db.category.findMany({ where: { slug: { startsWith: slug } }, select: { slug: true } });
  const suggestion = suggestFreeSlug(slug, taken.map((row) => row.slug));
  return `“${ownerName}” already uses /shop/${slug}. Try ${suggestion}.`;
}

async function codeTakenMessage(db: Tx, code: string): Promise<string | null> {
  const owner = await db.category.findUnique({ where: { code }, select: { name: true } });
  return owner ? `“${owner.name}” already uses ${code}. Each category needs its own code.` : null;
}

/** Friendly checks inside the transaction; the unique indexes still have the final say. */
async function checkCategoryClashes(
  tx: Tx,
  input: { name: string; slug: string; code: string | null; imageId: string | null },
  selfId: string | null,
): Promise<FieldFailure | null> {
  const notSelf = selfId ? { id: { not: selfId } } : {};
  const fieldErrors: Record<string, string> = {};

  const slugOwner = await tx.category.findFirst({ where: { slug: input.slug, ...notSelf }, select: { name: true } });
  if (slugOwner) fieldErrors.slug = await slugTakenMessage(tx, input.slug, slugOwner.name);

  const nameOwner = await tx.category.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" }, ...notSelf },
    select: { name: true },
  });
  if (nameOwner) fieldErrors.name = `Another category is already called “${nameOwner.name}”. Choose a different name.`;

  if (input.code) {
    const codeOwner = await tx.category.findFirst({ where: { code: input.code, ...notSelf }, select: { name: true } });
    if (codeOwner) fieldErrors.code = `“${codeOwner.name}” already uses ${input.code}. Each category needs its own code.`;
  }

  if (input.imageId) {
    const image = await tx.media.findUnique({ where: { id: input.imageId }, select: { id: true } });
    if (!image) fieldErrors.imageId = "That photo is no longer in the library. Choose another.";
  }

  return Object.keys(fieldErrors).length > 0 ? { ok: false, message: CHECK_FIELDS, fieldErrors } : null;
}

/** After a unique-index clash outside the friendly checks (two saves at once): name the field. */
async function explainUniqueClash(
  input: { slug: string; code: string | null },
  selfId: string | null,
): Promise<FieldFailure | null> {
  const db = getDb();
  const notSelf = selfId ? { id: { not: selfId } } : {};
  const fieldErrors: Record<string, string> = {};
  const slugOwner = await db.category.findFirst({ where: { slug: input.slug, ...notSelf }, select: { name: true } });
  if (slugOwner) fieldErrors.slug = await slugTakenMessage(db, input.slug, slugOwner.name);
  if (input.code) {
    const codeOwner = await db.category.findFirst({ where: { code: input.code, ...notSelf }, select: { id: true } });
    if (codeOwner) fieldErrors.code = (await codeTakenMessage(db, input.code)) ?? "That code is already in use.";
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, message: CHECK_FIELDS, fieldErrors } : null;
}

/* ── Details: create, update, delete ──────────────────────────────────── */

export interface CategoryInput {
  name: string;
  /** As typed ("" = make one from the name); cleaned with slugify. */
  slug: string;
  /** As typed; null when the form didn't send one (a locked code). */
  code: string | null;
  description: string;
  imageId: string | null;
  /** PLACE_FIRST or the id to follow; null leaves the position as it is (new ones go last). */
  placeAfter: string | null;
  confirmSlugChange: boolean;
}

function cleanSlug(input: CategoryInput): { ok: true; slug: string } | FieldFailure {
  const slug = slugify(input.slug || input.name);
  const problem = slugProblem(slug, "category");
  return problem ? fieldFailure("slug", problem) : { ok: true, slug };
}

function cleanCode(raw: string | null): { ok: true; code: string | null } | FieldFailure {
  if (raw === null) return { ok: true, code: null };
  const code = normaliseCategoryCode(raw);
  const problem = categoryCodeProblem(code);
  return problem ? fieldFailure("code", problem) : { ok: true, code };
}

/** Creates a category. */
export async function createCategory(
  input: CategoryInput,
  actorId: string,
): Promise<AdminActionResult<{ id: string; slug: string }>> {
  const slugResult = cleanSlug(input);
  const codeResult = cleanCode(input.code ?? "");
  if (!slugResult.ok || !codeResult.ok) {
    return {
      ok: false,
      message: CHECK_FIELDS,
      fieldErrors: {
        ...(slugResult.ok ? {} : slugResult.fieldErrors),
        ...(codeResult.ok ? {} : codeResult.fieldErrors),
      },
    };
  }
  const slug = slugResult.slug;
  const code = codeResult.code ?? "";

  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<{ id: string; slug: string }>> => {
      await lockAllCategories(tx);
      const clash = await checkCategoryClashes(tx, { name: input.name, slug, code, imageId: input.imageId }, null);
      if (clash) return clash;

      const before = await readCategoryOrder(tx);
      const created = await tx.category.create({
        data: {
          name: input.name,
          slug,
          code,
          description: input.description,
          imageId: input.imageId,
          sortOrder: before.ids.length,
        },
        select: { id: true },
      });
      const ordered = placeAfter(before.ids, created.id, input.placeAfter ?? before.ids.at(-1) ?? PLACE_FIRST);
      await saveCategoryOrder(tx, ordered, new Map([...before.positions, [created.id, before.ids.length]]));

      await recordAudit({
        tx,
        actorId,
        action: "category.create",
        entityType: "Category",
        entityId: created.id,
        summary: `Created the category “${input.name}” (code ${code}).`,
        metadata: { slug, code },
      });
      return { ok: true, data: { id: created.id, slug }, message: "Category created." };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      const explained = await explainUniqueClash({ slug, code }, null);
      if (explained) return explained;
    }
    if (prismaCode(error) === "P2003") {
      return fieldFailure("imageId", "That photo was removed from the library a moment ago. Choose another.");
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

export interface CategoryUpdateOutcome {
  id: string;
  slug: string;
  previousSlug: string;
  changed: string[];
}

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  slug: "web address",
  code: "code",
  description: "description",
  imageId: "photo",
  position: "position",
};

/** Saves a category's details (and, when chosen, its position). */
export async function updateCategory(
  id: string,
  input: CategoryInput,
  actorId: string,
): Promise<AdminActionResult<CategoryUpdateOutcome>> {
  const slugResult = cleanSlug(input);
  const codeResult = cleanCode(input.code);
  if (!slugResult.ok || !codeResult.ok) {
    return {
      ok: false,
      message: CHECK_FIELDS,
      fieldErrors: {
        ...(slugResult.ok ? {} : slugResult.fieldErrors),
        ...(codeResult.ok ? {} : codeResult.fieldErrors),
      },
    };
  }
  const slug = slugResult.slug;
  const repositioning = input.placeAfter !== null;

  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<CategoryUpdateOutcome>> => {
      if (repositioning) await lockAllCategories(tx);
      const locked = await lockCategory(tx, id);
      if (!locked) return { ok: false, message: CATEGORY_GONE };

      const current = await tx.category.findUniqueOrThrow({
        where: { id },
        select: { name: true, slug: true, code: true, description: true, imageId: true },
      });
      const code = codeResult.code ?? current.code;

      if (code !== current.code) {
        const variantCount = await tx.productVariant.count({ where: { product: { categoryId: id } } });
        if (variantCount > 0) {
          return fieldFailure(
            "code",
            `The code can’t change: ${variantCount} ${variantCount === 1 ? "SKU" : "SKUs"} in this category already include ${current.code}.`,
          );
        }
      }

      if (slug !== current.slug && !input.confirmSlugChange) {
        return fieldFailure(
          "confirmSlugChange",
          "Tick the box to confirm changing the web address.",
          "Changing the web address needs your confirmation.",
        );
      }

      const clash = await checkCategoryClashes(
        tx,
        { name: input.name, slug, code: code !== current.code ? code : null, imageId: input.imageId },
        id,
      );
      if (clash) return clash;

      const next = {
        name: input.name,
        slug,
        code,
        description: input.description,
        imageId: input.imageId,
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);

      let moved = false;
      if (repositioning) {
        const order = await readCategoryOrder(tx);
        const ordered = placeAfter(order.ids, id, input.placeAfter ?? PLACE_FIRST);
        moved = ordered.some((otherId, index) => order.ids[index] !== otherId);
        if (moved) await saveCategoryOrder(tx, ordered, order.positions);
      }

      if (changed.length === 0 && !moved) {
        return {
          ok: true,
          data: { id, slug, previousSlug: current.slug, changed: [] },
          message: "Nothing had changed, so there was nothing to save.",
        };
      }

      if (changed.length > 0) await tx.category.update({ where: { id }, data: next, select: { id: true } });

      const changedLabels = [...changed, ...(moved ? ["position"] : [])].map((key) => FIELD_LABELS[key] ?? key);
      const notes = [
        changed.includes("slug") ? `web address ${current.slug} → ${slug}` : null,
        changed.includes("code") ? `code ${current.code} → ${code}` : null,
      ].filter(Boolean);
      await recordAudit({
        tx,
        actorId,
        action: "category.update",
        entityType: "Category",
        entityId: id,
        summary: `Updated the category “${input.name}”: ${changedLabels.join(", ")}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}.`,
        metadata: {
          changed: changedLabels,
          ...(changed.includes("slug") ? { previousSlug: current.slug, slug } : {}),
          ...(changed.includes("code") ? { previousCode: current.code, code } : {}),
        },
      });

      return {
        ok: true,
        data: { id, slug, previousSlug: current.slug, changed: changedLabels },
        message: "Category saved.",
      };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      const explained = await explainUniqueClash({ slug, code: codeResult.code }, id);
      if (explained) return explained;
    }
    if (prismaCode(error) === "P2003") {
      return fieldFailure("imageId", "That photo was removed from the library a moment ago. Choose another.");
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

export interface DeletedCategory {
  name: string;
  slug: string;
}

/** Deletes a category that no product and no discount uses. */
export async function deleteCategory(id: string, actorId: string): Promise<AdminActionResult<DeletedCategory>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<DeletedCategory>> => {
      const locked = await lockCategory(tx, id);
      if (!locked) return { ok: false, message: CATEGORY_GONE };

      const productCount = await tx.product.count({ where: { categoryId: id } });
      if (productCount > 0) {
        return {
          ok: false,
          message: `“${locked.name}” still has ${productCount === 1 ? "1 product" : `${productCount} products`}. Move ${productCount === 1 ? "it" : "them"} to another category first.`,
        };
      }
      const coupons = await tx.couponCategory.findMany({
        where: { categoryId: id },
        select: { coupon: { select: { code: true } } },
      });
      if (coupons.length > 0) {
        const codes = coupons.map((link) => link.coupon.code).join(", ");
        return {
          ok: false,
          message: `Discounts are limited to “${locked.name}” (${codes}). Remove the category from them first, so none ends up applying to the whole shop.`,
        };
      }

      await tx.category.delete({ where: { id }, select: { id: true } });
      await recordAudit({
        tx,
        actorId,
        action: "category.delete",
        entityType: "Category",
        entityId: id,
        summary: `Deleted the category “${locked.name}” (code ${locked.code}).`,
        metadata: { name: locked.name, slug: locked.slug, code: locked.code },
      });
      return { ok: true, data: { name: locked.name, slug: locked.slug }, message: `Deleted “${locked.name}”.` };
    }, TRANSACTION);
  } catch (error) {
    if (prismaCode(error) === "P2003") {
      return { ok: false, message: "A product was added to this category a moment ago, so it can’t be deleted." };
    }
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}

/** Moves a category one place up or down in the shop's order. */
export async function moveCategory(
  id: string,
  direction: MoveDirection,
  actorId: string,
): Promise<AdminActionResult<ReorderOutcome>> {
  try {
    return await getDb().$transaction(async (tx): Promise<AdminActionResult<ReorderOutcome>> => {
      await lockAllCategories(tx);
      const order = await readCategoryOrder(tx);
      const row = order.rows.find((item) => item.id === id);
      if (!row) return { ok: false, message: CATEGORY_GONE };

      const ordered = moveInOrder(order.ids, id, direction);
      if (!ordered) {
        return {
          ok: true,
          data: { name: row.name, position: order.ids.indexOf(id) + 1, count: order.ids.length, slug: row.slug },
          message: `“${row.name}” is already ${direction === "up" ? "first" : "last"}.`,
        };
      }
      await saveCategoryOrder(tx, ordered, order.positions);
      const position = ordered.indexOf(id) + 1;
      await recordAudit({
        tx,
        actorId,
        action: "categories.reorder",
        entityType: "Category",
        entityId: id,
        summary: `Moved the category “${row.name}” ${direction} to position ${position} of ${ordered.length}.`,
        metadata: { direction, position },
      });
      return { ok: true, data: { name: row.name, position, count: ordered.length, slug: row.slug } };
    }, TRANSACTION);
  } catch (error) {
    const known = knownFailure(error);
    if (known) return known;
    throw error;
  }
}
