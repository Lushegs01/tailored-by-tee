"use server";

import { after } from "next/server";
import { z } from "zod";

import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import {
  UPLOADS_OFF_MESSAGE,
  createUploadTicket,
  destroyCloudinaryAsset,
  verifyCloudinaryUpload,
  type CloudinaryUploadTicket,
} from "@/lib/admin/cloudinary";
import { ALT_TEXT_MAX, checkRemoteImageUrl, imageSizeAdvice } from "@/lib/admin/image-probe";
import {
  createMedia,
  deleteUnusedMedia,
  findMediaByUrl,
  findUploadedMedia,
  inspectRemoteImage,
  inspectUploadedImage,
  listMedia,
  type AdminMedia,
  type MediaLibraryPage,
  type MediaUsage,
} from "@/lib/admin/media";
import { MAX_PAGE } from "@/lib/admin/pagination";
import { zId, zText } from "@/lib/admin/validation";

/*
 * Media library actions, used by the photo picker (components/admin/media). Each:
 * admin check and rate limit (withAdmin), input re-validated with zod, the change
 * and its audit entry in one transaction (lib/admin/media). Adding a photo to the
 * library changes nothing customers see until a product, category or collection
 * uses it, so no storefront refresh happens here; the action that attaches the
 * photo refreshes the catalogue.
 */

const altText = zText({
  min: 3,
  max: ALT_TEXT_MAX,
  required: "Describe the photo in a few words. It’s read aloud to customers who can’t see it.",
  label: "The description",
});

/* ── Browsing the library ───────────────────────────────────────────── */

const searchSchema = z.object({
  q: z
    .string()
    .catch("")
    .transform((value) => value.trim().slice(0, 100)),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).catch(1),
});

/** A page of the media library, newest first. Input: { q?: string, page?: number }. */
export async function searchMediaLibrary(input: unknown): Promise<AdminActionResult<MediaLibraryPage>> {
  return withAdmin<MediaLibraryPage>(
    "media.search",
    async () => {
      const parsed = parseInput(searchSchema, input ?? {});
      if (!parsed.ok) return parsed;
      const page = await listMedia({ q: parsed.data.q, page: parsed.data.page });
      return { ok: true, data: page };
    },
    { limit: 240 },
  );
}

/* ── Uploading ──────────────────────────────────────────────────────── */

/** Signed parameters for one direct upload to Cloudinary (never the secret). */
export async function requestMediaUploadTicket(): Promise<AdminActionResult<CloudinaryUploadTicket>> {
  return withAdmin<CloudinaryUploadTicket>(
    "media.upload.ticket",
    async () => {
      const ticket = createUploadTicket();
      if (!ticket) return { ok: false, message: UPLOADS_OFF_MESSAGE };
      return { ok: true, data: ticket };
    },
    { limit: 30 },
  );
}

const saveUploadSchema = z.object({
  upload: z.record(z.string(), z.unknown(), {
    error: "The upload didn’t finish. Please upload the photo again.",
  }),
  alt: altText,
});

/**
 * Saves a finished Cloudinary upload to the library. Input: { upload, alt }, where
 * `upload` is Cloudinary's reply as the browser received it. Nothing in it is
 * trusted until its signature and address check out (verifyCloudinaryUpload).
 */
export async function saveMediaUpload(input: unknown): Promise<AdminActionResult<AdminMedia>> {
  return withAdmin<AdminMedia>(
    "media.upload.save",
    async (admin) => {
      const parsed = parseInput(saveUploadSchema, input);
      if (!parsed.ok) return parsed;

      const check = verifyCloudinaryUpload(parsed.data.upload);
      if (!check.ok) return { ok: false, message: check.message };

      const existing = await findUploadedMedia(check.upload.publicId);
      if (existing)
        return { ok: true, data: existing, message: "This photo was already in your media library." };

      const inspection = await inspectUploadedImage(check.upload);
      if (!inspection.ok) return { ok: false, message: inspection.message };

      const media = await createMedia(
        {
          url: check.upload.url,
          width: inspection.width,
          height: inspection.height,
          alt: parsed.data.alt,
          color: inspection.color,
          blurDataUrl: inspection.blurDataUrl,
          provider: "cloudinary",
          publicId: check.upload.publicId,
        },
        admin.id,
      );
      const advice = imageSizeAdvice(media);
      return { ok: true, data: media, message: advice ? `Photo uploaded. ${advice}` : "Photo uploaded." };
    },
    { limit: 30 },
  );
}

/* ── Adding by web address ──────────────────────────────────────────── */

const urlSchema = z.object({
  url: zText({ max: 2048, required: "Paste the image’s web address.", label: "The address" }),
  alt: altText,
});

/**
 * Adds a photo by its web address (images.unsplash.com or res.cloudinary.com only).
 * For AdminForm: fields "url" and "alt". The server fetches the image itself to
 * confirm it is a photo and read its real size.
 */
export async function addMediaFromUrl(
  _previous: AdminActionResult<AdminMedia> | null,
  formData: FormData,
): Promise<AdminActionResult<AdminMedia>> {
  return withAdmin<AdminMedia>(
    "media.url.add",
    async (admin) => {
      const parsed = parseInput(urlSchema, formData);
      if (!parsed.ok) return parsed;

      const check = checkRemoteImageUrl(parsed.data.url);
      if (!check.ok) return { ok: false, message: check.message, fieldErrors: { url: check.message } };

      const existing = await findMediaByUrl(check.url.href);
      if (existing) {
        return {
          ok: true,
          data: existing,
          message: "That photo was already in your media library, so the existing copy was used.",
        };
      }

      const inspection = await inspectRemoteImage(check.url);
      if (!inspection.ok)
        return { ok: false, message: inspection.message, fieldErrors: { url: inspection.message } };

      const media = await createMedia(
        {
          url: check.url.href,
          width: inspection.width,
          height: inspection.height,
          alt: parsed.data.alt,
          color: inspection.color,
          blurDataUrl: inspection.blurDataUrl,
          provider: check.host === "images.unsplash.com" ? "unsplash" : "external",
          publicId: null,
        },
        admin.id,
      );
      const advice = imageSizeAdvice(media);
      return { ok: true, data: media, message: advice ? `Photo added. ${advice}` : "Photo added." };
    },
    { limit: 20 },
  );
}

/* ── Deleting ───────────────────────────────────────────────────────── */

const deleteSchema = z.object({ mediaId: zId() });

function describeUsage(usage: MediaUsage): string {
  const parts: string[] = [];
  if (usage.products) parts.push(`${usage.products} product${usage.products === 1 ? "" : "s"}`);
  if (usage.categories) parts.push(`${usage.categories} categor${usage.categories === 1 ? "y" : "ies"}`);
  if (usage.collections) parts.push(`${usage.collections} collection${usage.collections === 1 ? "" : "s"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "the site");
}

/**
 * Deletes a photo from the library — only when nothing uses it. Photos this site
 * uploaded are then removed from Cloudinary too, after the response (best effort:
 * a failure there never affects the result). Input: { mediaId }.
 */
export async function deleteMediaFromLibrary(input: unknown): Promise<AdminActionResult<null>> {
  return withAdmin<null>(
    "media.delete",
    async (admin) => {
      const parsed = parseInput(deleteSchema, input);
      if (!parsed.ok) return parsed;

      const outcome = await deleteUnusedMedia(parsed.data.mediaId, admin.id);
      if (!outcome.ok) {
        if (outcome.reason === "not_found")
          return { ok: true, data: null, message: "That photo had already been deleted." };
        return {
          ok: false,
          message: `This photo is used on ${describeUsage(outcome.usage)}, so it can’t be deleted. Remove it from there first.`,
        };
      }

      const { provider, publicId } = outcome.media;
      if (provider === "cloudinary" && publicId) {
        after(async () => {
          await destroyCloudinaryAsset(publicId);
        });
      }
      return { ok: true, data: null, message: "Photo deleted from the media library." };
    },
    { limit: 30 },
  );
}
