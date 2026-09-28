import "server-only";

import { inflateSync } from "node:zlib";

import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import { isCloudinaryConfigured } from "./cloudinary";
import type { VerifiedUpload } from "./cloudinary-sign";
import {
  checkRemoteImageUrl,
  colorOfSinglePixelPng,
  placeholderVariantUrls,
  probeImage,
  sniffImageFormat,
  type ProbedFormat,
} from "./image-probe";

/*
 * The media library: every photograph the site uses (Media), wherever it appears
 * — product photos (ProductImage), category images, collection heroes and
 * collection galleries all point at a Media row, so one photo can be reused and
 * its alt text is written once.
 *
 * Photos arrive two ways:
 * - uploaded to Cloudinary from the browser, then verified here (lib/admin/cloudinary);
 * - added by web address, from the two hosts next/image accepts (images.unsplash.com,
 *   res.cloudinary.com). The server fetches the start of the file itself (short
 *   timeout, byte cap, same-host redirects only) and reads its real size from the
 *   bytes (image-probe), so nothing about the image is taken on trust.
 * Either way the server also fetches two tiny renditions for the loading state:
 * a 16px blur (blurDataUrl) and a one-pixel average colour (color).
 *
 * A photo is deleted only when nothing uses it; Cloudinary files are then removed
 * from Cloudinary too, on a best-effort basis.
 */

/** The media shape other admin slices use (MediaField, category and collection forms). */
export interface AdminMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  color: string;
}

/** How many places use a photo. `collections` counts heroes and gallery images. */
export interface MediaUsage {
  products: number;
  categories: number;
  collections: number;
  total: number;
}

/** Where a photo came from, for the library: uploaded, Unsplash, or another web address. */
export type MediaSource = "upload" | "unsplash" | "web";

export interface AdminMediaListItem extends AdminMedia {
  source: MediaSource;
  /** ISO timestamp. */
  createdAt: string;
  usage: MediaUsage;
}

export interface MediaLibraryPage {
  items: AdminMediaListItem[];
  total: number;
  page: number;
  pageCount: number;
  query: string;
  /** Whether the Upload tab can upload (Cloudinary keys present). */
  uploadsEnabled: boolean;
}

/** The ground colour for a photo whose own colour couldn't be read: the brand's linen. */
export const DEFAULT_MEDIA_COLOR = "#ece8df";

export const MEDIA_LIBRARY_PAGE_SIZE = 24;

const adminMediaSelect = {
  id: true,
  url: true,
  width: true,
  height: true,
  alt: true,
  color: true,
} as const satisfies Prisma.MediaSelect;

const usageCountSelect = {
  _count: {
    select: { productImages: true, categories: true, collectionHeroes: true, collectionImages: true },
  },
} as const satisfies Prisma.MediaSelect;

type UsageCounts = {
  productImages: number;
  categories: number;
  collectionHeroes: number;
  collectionImages: number;
};

function toUsage(counts: UsageCounts): MediaUsage {
  const collections = counts.collectionHeroes + counts.collectionImages;
  return {
    products: counts.productImages,
    categories: counts.categories,
    collections,
    total: counts.productImages + counts.categories + collections,
  };
}

function sourceOf(provider: string): MediaSource {
  if (provider === "cloudinary") return "upload";
  if (provider === "unsplash") return "unsplash";
  return "web";
}

/* ── Reading ─────────────────────────────────────────────────────────── */

/** One photo by id, or null. For forms that show a chosen photo (MediaField's defaultValue). */
export async function getAdminMedia(id: string): Promise<AdminMedia | null> {
  if (!id) return null;
  return getDb().media.findUnique({ where: { id }, select: adminMediaSelect });
}

/** A page of the library, newest first, optionally searched by alt text, with usage counts. */
export async function listMedia(
  options: { q?: string; page?: number; pageSize?: number } = {},
): Promise<MediaLibraryPage> {
  const query = (options.q ?? "").trim().slice(0, 100);
  const pageSize = Math.min(Math.max(1, options.pageSize ?? MEDIA_LIBRARY_PAGE_SIZE), 60);
  const where: Prisma.MediaWhereInput = query ? { alt: { contains: query, mode: "insensitive" } } : {};
  const db = getDb();

  const total = await db.media.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);

  const rows =
    total === 0
      ? []
      : await db.media.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: { ...adminMediaSelect, provider: true, createdAt: true, ...usageCountSelect },
        });

  return {
    items: rows.map((row) => ({
      id: row.id,
      url: row.url,
      width: row.width,
      height: row.height,
      alt: row.alt,
      color: row.color,
      source: sourceOf(row.provider),
      createdAt: row.createdAt.toISOString(),
      usage: toUsage(row._count),
    })),
    total,
    page,
    pageCount,
    query,
    uploadsEnabled: isCloudinaryConfigured(),
  };
}

/** Where a photo is used, or null when it doesn't exist. */
export async function getMediaUsage(id: string, tx?: Prisma.TransactionClient): Promise<MediaUsage | null> {
  const row = await (tx ?? getDb()).media.findUnique({ where: { id }, select: usageCountSelect });
  return row ? toUsage(row._count) : null;
}

/** A photo this site already uploaded to Cloudinary (so a repeated save doesn't duplicate it). */
export async function findUploadedMedia(publicId: string): Promise<AdminMedia | null> {
  return getDb().media.findFirst({ where: { provider: "cloudinary", publicId }, select: adminMediaSelect });
}

/** A photo already in the library at exactly this address. */
export async function findMediaByUrl(url: string): Promise<AdminMedia | null> {
  return getDb().media.findFirst({ where: { url }, orderBy: { createdAt: "asc" }, select: adminMediaSelect });
}

/* ── Writing ─────────────────────────────────────────────────────────── */

export interface NewMediaInput {
  url: string;
  width: number;
  height: number;
  alt: string;
  color: string;
  blurDataUrl: string | null;
  /** "cloudinary" for this site's uploads, "unsplash" or "external" for web addresses. */
  provider: "cloudinary" | "unsplash" | "external";
  publicId: string | null;
}

function quote(text: string, max = 120): string {
  return `“${text.length > max ? `${text.slice(0, max - 1)}…` : text}”`;
}

/** Adds a photo to the library, with its audit entry, in one transaction. */
export async function createMedia(input: NewMediaInput, actorId: string): Promise<AdminMedia> {
  return getDb().$transaction(async (tx) => {
    const media = await tx.media.create({
      data: {
        url: input.url,
        width: input.width,
        height: input.height,
        alt: input.alt,
        color: input.color,
        blurDataUrl: input.blurDataUrl,
        provider: input.provider,
        publicId: input.publicId,
      },
      select: adminMediaSelect,
    });
    await recordAudit({
      tx,
      actorId,
      action: "media.create",
      entityType: "Media",
      entityId: media.id,
      summary:
        input.provider === "cloudinary"
          ? `Uploaded a photo to the media library: ${quote(input.alt)}.`
          : `Added a photo to the media library from ${new URL(input.url).hostname}: ${quote(input.alt)}.`,
      metadata: {
        provider: input.provider,
        publicId: input.publicId,
        width: input.width,
        height: input.height,
      },
    });
    return media;
  });
}

export type DeleteMediaOutcome =
  | { ok: true; media: { id: string; alt: string; provider: string; publicId: string | null } }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "in_use"; usage: MediaUsage };

/**
 * Deletes a photo from the library, but only while nothing uses it: the delete
 * itself checks that no product, category or collection points at it, so a photo
 * attached a moment earlier (by another admin) is never removed from under them.
 */
export async function deleteUnusedMedia(id: string, actorId: string): Promise<DeleteMediaOutcome> {
  const db = getDb();
  try {
    return await db.$transaction(async (tx): Promise<DeleteMediaOutcome> => {
      const media = await tx.media.findUnique({
        where: { id },
        select: { id: true, alt: true, provider: true, publicId: true },
      });
      if (!media) return { ok: false, reason: "not_found" };

      const deleted = await tx.$executeRaw`
        DELETE FROM "Media" AS m
        WHERE m."id" = ${id}
          AND NOT EXISTS (SELECT 1 FROM "ProductImage" p WHERE p."mediaId" = m."id")
          AND NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."imageId" = m."id")
          AND NOT EXISTS (SELECT 1 FROM "Collection" k WHERE k."heroImageId" = m."id")
          AND NOT EXISTS (SELECT 1 FROM "CollectionImage" ci WHERE ci."mediaId" = m."id")`;
      if (deleted === 0) {
        const usage = await getMediaUsage(id, tx);
        return usage ? { ok: false, reason: "in_use", usage } : { ok: false, reason: "not_found" };
      }

      await recordAudit({
        tx,
        actorId,
        action: "media.delete",
        entityType: "Media",
        entityId: id,
        summary: `Deleted a photo from the media library: ${quote(media.alt)}.`,
        metadata: { provider: media.provider, publicId: media.publicId },
      });
      return { ok: true, media };
    });
  } catch (error) {
    // A product photo added at the same instant makes the delete trip the
    // database's own foreign-key check: report it as in use.
    const usage = await getMediaUsage(id).catch(() => null);
    if (usage && usage.total > 0) return { ok: false, reason: "in_use", usage };
    throw error;
  }
}

/* ── Fetching remote images ──────────────────────────────────────────── */

const HEADER_TIMEOUT_MS = 10_000;
const PLACEHOLDER_TIMEOUT_MS = 5_000;
/** Enough for any real header, including big EXIF/XMP blocks before a JPEG's size. */
const MAX_HEADER_BYTES = 4 * 1024 * 1024;
const MAX_BLUR_BYTES = 8 * 1024;
const MAX_PIXEL_BYTES = 4 * 1024;
const MAX_REDIRECTS = 3;

type FetchFailureReason = "timeout" | "network" | "status" | "redirect" | "too_large" | "not_image";
type FetchResult =
  | { ok: true; bytes: Uint8Array; complete: boolean }
  | { ok: false; reason: FetchFailureReason; status?: number };

/** Reads the start of a response into one buffer, growing it as needed. */
class ByteBuffer {
  private buffer = new Uint8Array(64 * 1024);
  length = 0;

  push(chunk: Uint8Array) {
    if (this.length + chunk.length > this.buffer.length) {
      const next = new Uint8Array(Math.max(this.buffer.length * 2, this.length + chunk.length));
      next.set(this.buffer.subarray(0, this.length));
      this.buffer = next;
    }
    this.buffer.set(chunk, this.length);
    this.length += chunk.length;
  }

  view(): Uint8Array {
    return this.buffer.subarray(0, this.length);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/**
 * GETs an image from an allowed host, following at most a few redirects and only
 * within the same host (each hop re-checked), under an overall timeout, reading
 * no more than `maxBytes`. `decide` sees the bytes so far after each chunk and can
 * stop early ("stop": enough read) or give up ("reject": not an image).
 */
async function fetchImageBytes(
  start: URL,
  options: {
    maxBytes: number;
    timeoutMs: number;
    decide?: (bytes: Uint8Array) => "stop" | "continue" | "reject";
  },
): Promise<FetchResult> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      });
    } catch (error) {
      return { ok: false, reason: isAbortError(error) ? "timeout" : "network" };
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "redirect" };
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return { ok: false, reason: "redirect" };
      }
      const check = checkRemoteImageUrl(next.href);
      if (!check.ok || check.url.hostname !== start.hostname) return { ok: false, reason: "redirect" };
      url = check.url;
      continue;
    }

    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, reason: "status", status: response.status };
    }

    const reader = response.body.getReader();
    const buffer = new ByteBuffer();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return { ok: true, bytes: buffer.view(), complete: true };
        buffer.push(value);
        const decision = options.decide?.(buffer.view()) ?? "continue";
        if (decision !== "continue") {
          await reader.cancel().catch(() => undefined);
          return decision === "stop"
            ? { ok: true, bytes: buffer.view(), complete: false }
            : { ok: false, reason: "not_image" };
        }
        if (buffer.length > options.maxBytes) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, reason: "too_large" };
        }
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: isAbortError(error) ? "timeout" : "network" };
    }
  }
  return { ok: false, reason: "redirect" };
}

/** Stop once the image's size can be read; give up early on bytes that aren't an image at all. */
function headerDecision(bytes: Uint8Array): "stop" | "continue" | "reject" {
  if (probeImage(bytes)) return "stop";
  if (bytes.length >= 512 && sniffImageFormat(bytes) === null) return "reject";
  return "continue";
}

const MIME: Record<ProbedFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * The loading-state placeholders for a photo: a tiny blurred version as a data
 * URL, and its average colour. Either is null when it couldn't be fetched in time
 * (the photo still works: pages show the ground colour instead).
 */
async function buildPlaceholders(url: string): Promise<{ blurDataUrl: string | null; color: string | null }> {
  const variants = placeholderVariantUrls(url);
  if (!variants) return { blurDataUrl: null, color: null };

  const [blur, pixel] = await Promise.all([
    fetchImageBytes(new URL(variants.blur), { maxBytes: MAX_BLUR_BYTES, timeoutMs: PLACEHOLDER_TIMEOUT_MS }),
    fetchImageBytes(new URL(variants.pixel), {
      maxBytes: MAX_PIXEL_BYTES,
      timeoutMs: PLACEHOLDER_TIMEOUT_MS,
    }),
  ]);

  let blurDataUrl: string | null = null;
  if (blur.ok && blur.complete) {
    const format = sniffImageFormat(blur.bytes);
    if (format && format !== "avif")
      blurDataUrl = `data:${MIME[format]};base64,${Buffer.from(blur.bytes).toString("base64")}`;
  }

  const color =
    pixel.ok && pixel.complete
      ? colorOfSinglePixelPng(pixel.bytes, (data) => inflateSync(data, { maxOutputLength: 1024 }))
      : null;

  return { blurDataUrl, color };
}

export type ImageInspection =
  | {
      ok: true;
      width: number;
      height: number;
      format: ProbedFormat;
      color: string;
      blurDataUrl: string | null;
    }
  | { ok: false; message: string };

function fetchFailureMessage(result: { reason: FetchFailureReason; status?: number }): string {
  switch (result.reason) {
    case "timeout":
      return "The image took too long to load. Try again, or upload the photo instead.";
    case "redirect":
      return "That address sends the image on to somewhere else, which isn’t allowed. Copy the image’s own address.";
    case "not_image":
    case "too_large":
      return "That address isn’t a JPEG, PNG, WebP or AVIF image. Copy the image’s own address, not the page it’s on.";
    case "status":
      if (result.status === 404 || result.status === 410)
        return "There’s no image at that address. Check it and try again.";
      if (result.status === 401 || result.status === 403) {
        return "That image isn’t public, so it can’t be added. Check the address, or upload the photo instead.";
      }
      return "The image couldn’t be loaded just now. Try again in a moment.";
    default:
      return "The image couldn’t be loaded. Check the address and try again.";
  }
}

/**
 * Checks a web address really is a photo we can use: fetches the start of the
 * file (see fetchImageBytes), reads its format and size from the bytes, and builds
 * the placeholders. `url` must already have passed checkRemoteImageUrl.
 */
export async function inspectRemoteImage(url: URL): Promise<ImageInspection> {
  const [header, placeholders] = await Promise.all([
    fetchImageBytes(url, {
      maxBytes: MAX_HEADER_BYTES,
      timeoutMs: HEADER_TIMEOUT_MS,
      decide: headerDecision,
    }),
    buildPlaceholders(url.href),
  ]);
  if (!header.ok) return { ok: false, message: fetchFailureMessage(header) };

  const probed = probeImage(header.bytes);
  if (!probed) return { ok: false, message: fetchFailureMessage({ reason: "not_image" }) };

  return {
    ok: true,
    width: probed.width,
    height: probed.height,
    format: probed.format,
    color: placeholders.color ?? DEFAULT_MEDIA_COLOR,
    blurDataUrl: placeholders.blurDataUrl,
  };
}

/**
 * The facts to store for a verified Cloudinary upload. The size is re-read from
 * the delivered file when possible (Cloudinary's reply isn't covered by its
 * signature beyond the public id and version); if Cloudinary can't be reached
 * just then, the reported size is used. A missing file is an error.
 */
export async function inspectUploadedImage(upload: VerifiedUpload): Promise<ImageInspection> {
  const [header, placeholders] = await Promise.all([
    fetchImageBytes(new URL(upload.url), {
      maxBytes: MAX_HEADER_BYTES,
      timeoutMs: HEADER_TIMEOUT_MS,
      decide: headerDecision,
    }),
    buildPlaceholders(upload.url),
  ]);

  if (!header.ok && header.reason === "status" && (header.status === 404 || header.status === 410)) {
    return { ok: false, message: "Cloudinary no longer has this photo. Please upload it again." };
  }
  if (!header.ok && header.reason === "not_image") {
    return {
      ok: false,
      message: "Cloudinary couldn’t read this file. Upload a JPEG, PNG, WebP or AVIF photo.",
    };
  }

  const probed = header.ok ? probeImage(header.bytes) : null;
  return {
    ok: true,
    width: probed?.width ?? upload.width,
    height: probed?.height ?? upload.height,
    format: probed?.format ?? (upload.format === "jpg" ? "jpeg" : upload.format),
    color: upload.color ?? placeholders.color ?? DEFAULT_MEDIA_COLOR,
    blurDataUrl: placeholders.blurDataUrl,
  };
}
