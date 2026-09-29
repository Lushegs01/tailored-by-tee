import "server-only";

import {
  buildSignedDestroyFields,
  buildSignedUploadFields,
  checkUploadResult,
  cloudinaryDestroyUrl,
  cloudinaryUploadUrl,
  readCloudinaryCredentials,
  type CloudinaryCredentials,
  type UploadCheck,
} from "./cloudinary-sign";
import { MAX_UPLOAD_BYTES } from "./image-probe";

/*
 * Cloudinary, wired to this deployment's credentials. Uploads are on when
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are all set
 * (or CLOUDINARY_URL); otherwise photos can only be added by their web address.
 * The secret never leaves this module: the browser receives signed parameters
 * and the API key, which are safe to expose. See cloudinary-sign.ts for how an
 * upload is verified.
 */

function credentials(): CloudinaryCredentials | null {
  return readCloudinaryCredentials(process.env);
}

/** Whether photos can be uploaded (all Cloudinary keys present and well-formed). */
export function isCloudinaryConfigured(): boolean {
  return credentials() !== null;
}

/** What the browser needs to upload one photo straight to Cloudinary. Contains no secret. */
export interface CloudinaryUploadTicket {
  /** https://api.cloudinary.com/v1_1/<cloud>/image/upload */
  uploadUrl: string;
  /** Post these alongside `file`, unchanged: api_key, timestamp, folder, colors, allowed_formats, signature. */
  fields: Record<string, string>;
  maxBytes: number;
  /** Cloudinary refuses a signature after an hour; ask for a new ticket before then. */
  expiresAt: number;
}

/** A freshly signed upload ticket, or null when uploads aren't set up. */
export function createUploadTicket(now = Date.now()): CloudinaryUploadTicket | null {
  const keys = credentials();
  if (!keys) return null;
  return {
    uploadUrl: cloudinaryUploadUrl(keys.cloudName),
    fields: buildSignedUploadFields(keys, now / 1000),
    maxBytes: MAX_UPLOAD_BYTES,
    expiresAt: now + 50 * 60_000,
  };
}

export const UPLOADS_OFF_MESSAGE =
  "Uploading needs Cloudinary, which isn’t set up yet. Add the photo by its web address instead, or ask your developer to add the Cloudinary keys (see Settings).";

/** Verifies an upload response the browser passed on. Never trust any field of it before this. */
export function verifyCloudinaryUpload(raw: unknown): UploadCheck {
  const keys = credentials();
  if (!keys) return { ok: false, message: UPLOADS_OFF_MESSAGE };
  return checkUploadResult(raw, keys);
}

const DESTROY_TIMEOUT_MS = 8_000;

/**
 * Deletes an uploaded photo from Cloudinary (and its CDN copies). Best effort:
 * never throws, and a failure only leaves an unused file in Cloudinary. Only for
 * photos this site uploaded (provider "cloudinary").
 */
export async function destroyCloudinaryAsset(publicId: string): Promise<"deleted" | "not_found" | "failed"> {
  const keys = credentials();
  if (!keys || !publicId) return "failed";
  try {
    const response = await fetch(cloudinaryDestroyUrl(keys.cloudName), {
      method: "POST",
      body: new URLSearchParams(buildSignedDestroyFields(keys, publicId, Date.now() / 1000)),
      signal: AbortSignal.timeout(DESTROY_TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { result?: unknown } | null;
    if (response.ok && body?.result === "ok") return "deleted";
    if (response.ok && body?.result === "not found") return "not_found";
    console.error(`[admin] Cloudinary didn't delete ${publicId}: HTTP ${response.status}`);
    return "failed";
  } catch (error) {
    console.error(
      `[admin] Cloudinary delete of ${publicId} failed:`,
      error instanceof Error ? error.message : error,
    );
    return "failed";
  }
}
