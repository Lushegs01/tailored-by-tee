"use server";

import { z } from "zod";

import {
  IMAGE_ROLES,
  IMAGE_ROLE_LABELS,
  MAX_PRODUCT_IMAGES,
  defaultRoleForNewImage,
  imagesToDemote,
  isExclusiveRole,
  moveInOrder,
  type AddedProductImage,
  type ImageRole,
} from "@/components/admin/products/images/image-rules";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/admin/audit";
import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import { ALT_TEXT_MAX } from "@/lib/admin/image-probe";
import { zId, zOneOf, zText } from "@/lib/admin/validation";
import { getDb } from "@/lib/db";

/*
 * A product's photos: add, edit (role, colour, description), reorder, remove.
 *
 * Each action: admin check and rate limit (withAdmin); input re-validated with
 * zod; then one transaction that first locks the product row, so two admins
 * editing the same product's photos take turns (the one-main-image-per-colour
 * rule and the photo order can't be broken by a race). Every photo is checked to
 * belong to the product named in the request. The audit entry is written in the
 * same transaction, and the storefront catalogue is refreshed after it commits.
 * Rules and wording: components/admin/products/images/image-rules.ts.
 */

type Tx = Prisma.TransactionClient;

const RATE_LIMIT = { limit: 90, windowMs: 60_000 } as const;

const PRODUCT_GONE = "This product no longer exists. Go back to the product list.";
const IMAGE_GONE = "That photo is no longer on this product. Refresh the page to see its current photos.";

interface LockedProduct {
  id: string;
  name: string;
  colors: { id: string; name: string }[];
}

/** Locks the product row for the rest of the transaction. Null when it doesn't exist. */
async function lockProduct(tx: Tx, productId: string): Promise<LockedProduct | null> {
  const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
    SELECT "id", "name" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  const product = rows[0];
  if (!product) return null;
  const colors = await tx.productColor.findMany({
    where: { productId },
    orderBy: { position: "asc" },
    select: { colorId: true, color: { select: { name: true } } },
  });
  return {
    id: product.id,
    name: product.name,
    colors: colors.map((link) => ({ id: link.colorId, name: link.color.name })),
  };
}

interface ImageRow {
  id: string;
  role: ImageRole;
  colorId: string | null;
  position: number;
  mediaId: string;
}

async function loadImages(tx: Tx, productId: string): Promise<ImageRow[]> {
  return tx.productImage.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, role: true, colorId: true, position: true, mediaId: true },
  });
}

/** Stores `orderedIds` as positions 0, 1, 2 … (only rows whose position changes are written). */
async function writeOrder(tx: Tx, orderedIds: readonly string[], current: readonly ImageRow[]) {
  for (const [index, id] of orderedIds.entries()) {
    if (current.find((image) => image.id === id)?.position === index) continue;
    await tx.productImage.update({ where: { id }, data: { position: index } });
  }
}

function colourName(product: LockedProduct, colorId: string | null): string {
  if (colorId === null) return "all colours";
  return product.colors.find((color) => color.id === colorId)?.name ?? "a colour no longer offered";
}

function roleWords(role: ImageRole): string {
  return role === "PRIMARY"
    ? "the main image"
    : role === "ALTERNATE"
      ? "the hover image"
      : IMAGE_ROLE_LABELS[role].toLowerCase();
}

/* ── Add ─────────────────────────────────────────────────────────────── */

const addSchema = z.object({ productId: zId(), mediaId: zId() });

/**
 * Adds a library photo to a product, at the end of its photos, for all colours.
 * It becomes the main image if the product has none, else the hover image if it
 * has none, else a gallery photo. Input: { productId, mediaId }.
 */
export async function addProductImage(input: unknown): Promise<AdminActionResult<AddedProductImage>> {
  return withAdmin<AddedProductImage>(
    "product.image.add",
    async (admin) => {
      const parsed = parseInput(addSchema, input);
      if (!parsed.ok) return parsed;
      const { productId, mediaId } = parsed.data;

      const result = await getDb().$transaction(async (tx): Promise<AdminActionResult<AddedProductImage>> => {
        const product = await lockProduct(tx, productId);
        if (!product) return { ok: false, message: PRODUCT_GONE };

        const media = await tx.media.findUnique({ where: { id: mediaId }, select: { id: true } });
        if (!media)
          return { ok: false, message: "That photo is no longer in the media library. Choose another." };

        const images = await loadImages(tx, productId);
        if (images.some((image) => image.mediaId === mediaId)) {
          return { ok: false, message: "That photo is already on this product." };
        }
        if (images.length >= MAX_PRODUCT_IMAGES) {
          return {
            ok: false,
            message: `A product can have up to ${MAX_PRODUCT_IMAGES} photos. Remove one before adding another.`,
          };
        }

        const role = defaultRoleForNewImage(images);
        const created = await tx.productImage.create({
          data: { productId, mediaId, role, colorId: null, position: images.length },
          select: { id: true },
        });
        await writeOrder(
          tx,
          [...images.map((image) => image.id), created.id],
          [...images, { id: created.id, role, colorId: null, position: images.length, mediaId }],
        );

        await recordAudit({
          tx,
          actorId: admin.id,
          action: "product.image.add",
          entityType: "Product",
          entityId: productId,
          summary: `Added a photo to ${product.name} as ${roleWords(role)}.`,
          metadata: { imageId: created.id, mediaId, role },
        });

        return {
          ok: true,
          data: { imageId: created.id, role },
          message:
            role === "GALLERY"
              ? `Photo ${images.length + 1} added to the gallery.`
              : `Photo ${images.length + 1} added as ${roleWords(role)}.`,
        };
      });

      if (result.ok) refreshStorefrontCatalog();
      return result;
    },
    RATE_LIMIT,
  );
}

/* ── Edit ────────────────────────────────────────────────────────────── */

const updateSchema = z.object({
  productId: zId(),
  imageId: zId(),
  role: zOneOf(IMAGE_ROLES, "Choose what this photo is for."),
  colorId: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z
        .string()
        .max(191)
        .regex(/^[A-Za-z0-9_.:-]*$/, "Choose a colour."),
    )
    .transform((value) => (value === "" ? null : value)),
  alt: zText({
    min: 3,
    max: ALT_TEXT_MAX,
    required: "Describe the photo in a few words. It’s read aloud to customers who can’t see it.",
    label: "The description",
  }),
});

/**
 * Saves one photo's role, colour and description (AdminForm fields: productId,
 * imageId, role, colorId — "" for all colours — and alt). Making it the main or
 * hover image for a colour turns that colour's previous one into a gallery
 * photo. The description belongs to the photo itself, so it changes everywhere
 * the photo is used.
 */
export async function updateProductImage(
  _previous: AdminActionResult<null> | null,
  formData: FormData,
): Promise<AdminActionResult<null>> {
  return withAdmin<null>(
    "product.image.update",
    async (admin) => {
      const parsed = parseInput(updateSchema, formData);
      if (!parsed.ok) return parsed;
      const { productId, imageId, role, colorId, alt } = parsed.data;

      const result = await getDb().$transaction(
        async (tx): Promise<AdminActionResult<null> & { changed?: boolean }> => {
          const product = await lockProduct(tx, productId);
          if (!product) return { ok: false, message: PRODUCT_GONE };

          const images = await loadImages(tx, productId);
          const image = images.find((candidate) => candidate.id === imageId);
          if (!image) return { ok: false, message: IMAGE_GONE };

          const allowedColour =
            colorId === null ||
            colorId === image.colorId ||
            product.colors.some((color) => color.id === colorId);
          if (!allowedColour) {
            const message = "Choose one of this product’s colours, or “All colours”.";
            return { ok: false, message, fieldErrors: { colorId: message } };
          }

          const media = await tx.media.findUnique({ where: { id: image.mediaId }, select: { alt: true } });
          const altChanged = media !== null && media.alt !== alt;
          const placementChanged = image.role !== role || image.colorId !== colorId;
          if (!altChanged && !placementChanged)
            return { ok: true, data: null, message: "No changes to save.", changed: false };

          const demoted = placementChanged ? imagesToDemote(images, { id: imageId, role, colorId }) : [];
          if (demoted.length > 0) {
            await tx.productImage.updateMany({
              where: { productId, id: { in: demoted.map((other) => other.id) }, role },
              data: { role: "GALLERY" },
            });
          }
          if (placementChanged) {
            await tx.productImage.update({ where: { id: imageId }, data: { role, colorId } });
          }
          if (altChanged) {
            await tx.media.update({ where: { id: image.mediaId }, data: { alt } });
          }

          const number = images.indexOf(image) + 1;
          const changes: string[] = [];
          if (placementChanged)
            changes.push(`made it ${roleWords(role)} for ${colourName(product, colorId)}`);
          if (altChanged) changes.push("changed its description");
          await recordAudit({
            tx,
            actorId: admin.id,
            action: "product.image.update",
            entityType: "Product",
            entityId: productId,
            summary: `Edited photo ${number} of ${product.name}: ${changes.join(" and ")}.`,
            metadata: {
              imageId,
              mediaId: image.mediaId,
              before: { role: image.role, colorId: image.colorId },
              after: { role, colorId },
              demoted: demoted.map((other) => other.id),
              altChanged,
            },
          });

          let message = `Photo ${number} saved.`;
          for (const other of demoted) {
            message += ` Photo ${images.indexOf(other) + 1} was ${roleWords(role)} for ${colourName(product, colorId)}, so it’s now a gallery photo.`;
          }
          if (
            isExclusiveRole(role) &&
            colorId !== null &&
            !product.colors.some((color) => color.id === colorId)
          ) {
            message += " Its colour is no longer offered, so customers won’t see it in that role.";
          }
          return { ok: true, data: null, message, changed: true };
        },
      );

      if (!result.ok) return result;
      if (result.changed) refreshStorefrontCatalog();
      return { ok: true, data: null, message: result.message };
    },
    RATE_LIMIT,
  );
}

/* ── Reorder ─────────────────────────────────────────────────────────── */

const moveSchema = z.object({
  productId: zId(),
  imageId: zId(),
  direction: zOneOf(["up", "down"] as const),
});

/** Moves one photo a place earlier or later in the product's photo order. Input: { productId, imageId, direction }. */
export async function moveProductImage(input: unknown): Promise<AdminActionResult<{ position: number }>> {
  return withAdmin<{ position: number }>(
    "product.image.move",
    async (admin) => {
      const parsed = parseInput(moveSchema, input);
      if (!parsed.ok) return parsed;
      const { productId, imageId, direction } = parsed.data;

      const result = await getDb().$transaction(
        async (tx): Promise<AdminActionResult<{ position: number }>> => {
          const product = await lockProduct(tx, productId);
          if (!product) return { ok: false, message: PRODUCT_GONE };

          const images = await loadImages(tx, productId);
          const ids = images.map((image) => image.id);
          if (!ids.includes(imageId)) return { ok: false, message: IMAGE_GONE };

          const order = moveInOrder(ids, imageId, direction);
          if (!order) {
            return {
              ok: false,
              message: direction === "up" ? "That photo is already first." : "That photo is already last.",
            };
          }
          await writeOrder(tx, order, images);

          const from = ids.indexOf(imageId) + 1;
          const to = order.indexOf(imageId) + 1;
          await recordAudit({
            tx,
            actorId: admin.id,
            action: "product.image.move",
            entityType: "Product",
            entityId: productId,
            summary: `Moved photo ${from} of ${product.name} to position ${to}.`,
            metadata: { imageId, from, to },
          });
          return {
            ok: true,
            data: { position: to },
            message: `Photo moved to position ${to} of ${order.length}.`,
          };
        },
      );

      if (result.ok) refreshStorefrontCatalog();
      return result;
    },
    RATE_LIMIT,
  );
}

/* ── Remove ──────────────────────────────────────────────────────────── */

const removeSchema = z.object({ productId: zId(), imageId: zId() });

/**
 * Takes a photo off a product. The photo stays in the media library (it may be
 * used elsewhere, and can be added back). Input: { productId, imageId }.
 */
export async function removeProductImage(input: unknown): Promise<AdminActionResult<null>> {
  return withAdmin<null>(
    "product.image.remove",
    async (admin) => {
      const parsed = parseInput(removeSchema, input);
      if (!parsed.ok) return parsed;
      const { productId, imageId } = parsed.data;

      const result = await getDb().$transaction(async (tx): Promise<AdminActionResult<null>> => {
        const product = await lockProduct(tx, productId);
        if (!product) return { ok: false, message: PRODUCT_GONE };

        const images = await loadImages(tx, productId);
        const image = images.find((candidate) => candidate.id === imageId);
        if (!image) return { ok: false, message: IMAGE_GONE };

        await tx.productImage.delete({ where: { id: imageId } });
        const remaining = images.filter((candidate) => candidate.id !== imageId);
        await writeOrder(
          tx,
          remaining.map((candidate) => candidate.id),
          remaining,
        );

        const number = images.indexOf(image) + 1;
        await recordAudit({
          tx,
          actorId: admin.id,
          action: "product.image.remove",
          entityType: "Product",
          entityId: productId,
          summary: `Removed photo ${number} (${roleWords(image.role)}) from ${product.name}. It stays in the media library.`,
          metadata: { imageId, mediaId: image.mediaId, role: image.role, colorId: image.colorId },
        });

        let message = `Photo ${number} removed from this product. It’s still in the media library.`;
        if (image.role === "PRIMARY" && !remaining.some((candidate) => candidate.role === "PRIMARY")) {
          message +=
            " The product now has no main image, so it won’t appear in the shop until you choose one.";
        }
        return { ok: true, data: null, message };
      });

      if (result.ok) refreshStorefrontCatalog();
      return result;
    },
    RATE_LIMIT,
  );
}
