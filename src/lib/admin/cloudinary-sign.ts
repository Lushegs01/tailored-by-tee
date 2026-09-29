import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from "./image-probe";

/*
 * Cloudinary request signing and upload verification. Pure (node:crypto and zod
 * only, no network, no environment), so it is tested directly; lib/admin/cloudinary
 * wires it to the real credentials.
 *
 * How uploads stay trustworthy although the browser talks to Cloudinary directly:
 * 1. The server signs the upload parameters (folder, allowed formats, timestamp)
 *    with the API secret. The browser gets the signature and the API key, never
 *    the secret, and can't change a signed parameter without breaking it.
 * 2. Cloudinary answers the browser with the new asset, including a signature of
 *    its public id and version made with the same secret.
 * 3. The browser hands that answer to a server action, which re-computes the
 *    signature (checkUploadResult) and checks the delivery address belongs to
 *    this account before anything is saved. A made-up or altered answer fails.
 */

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  /** Never sent to the browser, logged or shown. */
  apiSecret: string;
}

/** Where uploads go in the Cloudinary media library. */
export const CLOUDINARY_UPLOAD_FOLDER = "tailored-by-tee/media";

/** Cloudinary's names for the formats the uploader accepts. */
export const CLOUDINARY_FORMATS = ["jpg", "png", "webp", "avif"] as const;
export type CloudinaryFormat = (typeof CLOUDINARY_FORMATS)[number];

const CLOUD_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const API_KEY = /^[A-Za-z0-9_-]{4,64}$/;
const API_SECRET = /^[A-Za-z0-9_-]{8,128}$/;

/* ── Credentials ─────────────────────────────────────────────────────── */

/**
 * Cloudinary's single-variable form: cloudinary://<api key>:<api secret>@<cloud name>.
 * Null when it isn't one.
 */
export function parseCloudinaryUrl(value: string): CloudinaryCredentials | null {
  const match = /^cloudinary:\/\/([^:@/\s]+):([^@/\s]+)@([^/?#\s]+)\/?$/.exec(value.trim());
  if (!match) return null;
  try {
    return validCredentials({
      apiKey: decodeURIComponent(match[1]),
      apiSecret: decodeURIComponent(match[2]),
      cloudName: decodeURIComponent(match[3]),
    });
  } catch {
    return null;
  }
}

/**
 * The credentials from the environment: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY
 * and CLOUDINARY_API_SECRET together, or CLOUDINARY_URL. Null when neither is
 * complete and well-formed (uploads are then off).
 */
export function readCloudinaryCredentials(
  env: Readonly<Record<string, string | undefined>>,
): CloudinaryCredentials | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  if (cloudName && apiKey && apiSecret) {
    const separate = validCredentials({ cloudName, apiKey, apiSecret });
    if (separate) return separate;
  }
  const url = env.CLOUDINARY_URL?.trim();
  return url ? parseCloudinaryUrl(url) : null;
}

function validCredentials(credentials: CloudinaryCredentials): CloudinaryCredentials | null {
  return CLOUD_NAME.test(credentials.cloudName) &&
    API_KEY.test(credentials.apiKey) &&
    API_SECRET.test(credentials.apiSecret)
    ? credentials
    : null;
}

/* ── Signing ─────────────────────────────────────────────────────────── */

export type SignableValue = string | number | boolean | readonly (string | number)[] | null | undefined;

/** Parameters Cloudinary never includes in a signature. */
const UNSIGNED_PARAMETERS = new Set(["file", "cloud_name", "resource_type", "api_key", "signature"]);

/**
 * The string Cloudinary signs: every present parameter except file, cloud_name,
 * resource_type and api_key, as "key=value" (lists joined with commas), sorted,
 * joined with "&". Values are not URL-encoded.
 */
export function signatureBase(params: Readonly<Record<string, SignableValue>>): string {
  return Object.entries(params)
    .filter(([key, value]) => {
      if (UNSIGNED_PARAMETERS.has(key) || value === null || value === undefined) return false;
      return (Array.isArray(value) ? value.join(",") : String(value)).length > 0;
    })
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value)}`)
    .sort()
    .join("&");
}

/** Signs request parameters: hex SHA-1 (or SHA-256) of the signature base followed by the API secret. */
export function signParams(
  params: Readonly<Record<string, SignableValue>>,
  apiSecret: string,
  algorithm: "sha1" | "sha256" = "sha1",
): string {
  return createHash(algorithm)
    .update(signatureBase(params) + apiSecret)
    .digest("hex");
}

/** Compares two hex digests in constant time. */
function sameDigest(expected: string, actual: string): boolean {
  const a = Buffer.from(expected.toLowerCase(), "utf8");
  const b = Buffer.from(actual.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Checks the signature Cloudinary puts in an upload response: a digest of
 * "public_id=<id>&version=<version>" followed by the API secret. SHA-1 by default;
 * accounts set to SHA-256 send a 64-character signature, which is checked as such.
 */
export function verifyResponseSignature(
  response: { publicId: string; version: number | string; signature: string },
  apiSecret: string,
): boolean {
  const signature = response.signature.trim();
  const algorithm = signature.length === 64 ? "sha256" : signature.length === 40 ? "sha1" : null;
  if (!algorithm || !/^[0-9a-fA-F]+$/.test(signature)) return false;
  const expected = signParams(
    { public_id: response.publicId, version: String(response.version) },
    apiSecret,
    algorithm,
  );
  return sameDigest(expected, signature);
}

/* ── Upload parameters ───────────────────────────────────────────────── */

/**
 * The parameters the browser sends with an upload, signed. The browser adds `file`
 * and posts them to https://api.cloudinary.com/v1_1/<cloud>/image/upload.
 * `colors` asks Cloudinary to report the photo's main colours (used for the
 * frame shown while the photo loads); `allowed_formats` makes Cloudinary itself
 * refuse anything that isn't a JPEG, PNG, WebP or AVIF.
 */
export function buildSignedUploadFields(
  credentials: CloudinaryCredentials,
  timestamp: number,
  folder = CLOUDINARY_UPLOAD_FOLDER,
): Record<string, string> {
  const params = {
    allowed_formats: CLOUDINARY_FORMATS.join(","),
    colors: "true",
    folder,
    timestamp: String(Math.floor(timestamp)),
  };
  return { ...params, api_key: credentials.apiKey, signature: signParams(params, credentials.apiSecret) };
}

/** Signed parameters for deleting one uploaded image (and clearing it from Cloudinary's CDN). */
export function buildSignedDestroyFields(
  credentials: CloudinaryCredentials,
  publicId: string,
  timestamp: number,
): Record<string, string> {
  const params = { invalidate: "true", public_id: publicId, timestamp: String(Math.floor(timestamp)) };
  return { ...params, api_key: credentials.apiKey, signature: signParams(params, credentials.apiSecret) };
}

export function cloudinaryUploadUrl(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
}

export function cloudinaryDestroyUrl(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`;
}

/* ── Verifying an upload ─────────────────────────────────────────────── */

/** Path segments of a public id: letters, digits, "_", "-" and inner dots; no "..", no empty segments. */
const PUBLIC_ID = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}(\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}){0,9}$/;

const uploadResultSchema = z.object({
  public_id: z
    .string()
    .max(255)
    .regex(PUBLIC_ID)
    .refine((value) => !value.includes(".."), "Bad public id."),
  version: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d{1,15}$/)
        .transform(Number),
    ])
    .pipe(z.number().int().positive()),
  signature: z.string().regex(/^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/),
  resource_type: z.literal("image"),
  type: z.literal("upload"),
  format: z
    .string()
    .transform((value) => (value.toLowerCase() === "jpeg" ? "jpg" : value.toLowerCase()))
    .pipe(z.enum(CLOUDINARY_FORMATS)),
  width: z.number().int().min(1).max(MAX_IMAGE_DIMENSION),
  height: z.number().int().min(1).max(MAX_IMAGE_DIMENSION),
  bytes: z.number().int().min(1),
  secure_url: z.string().max(2048),
  // [["#e9e9e7", 23.9], …], most prominent first. Only read, never required.
  colors: z.unknown().optional(),
});

export interface VerifiedUpload {
  publicId: string;
  version: number;
  format: CloudinaryFormat;
  /** As Cloudinary reported them (the server re-reads them from the delivered file when it can). */
  width: number;
  height: number;
  bytes: number;
  /** The https delivery address on res.cloudinary.com/<cloud>/, tied to the signed public id and version. */
  url: string;
  /** Cloudinary's most prominent colour as "#rrggbb", or null. */
  color: string | null;
}

export type UploadCheck = { ok: true; upload: VerifiedUpload } | { ok: false; message: string };

const UNVERIFIED_MESSAGE =
  "We couldn’t confirm that this upload came from your Cloudinary account, so it wasn’t saved. Please upload the photo again.";

/**
 * Verifies an upload response the browser passed on (see the file comment) and
 * returns the fields that can be trusted. Checks, in order: the response's shape;
 * Cloudinary's signature of public id + version; that the delivery address is on
 * res.cloudinary.com/<this cloud>/image/upload/ and names exactly that version
 * and public id; and the file size limit.
 */
export function checkUploadResult(raw: unknown, credentials: CloudinaryCredentials): UploadCheck {
  const parsed = uploadResultSchema.safeParse(raw);
  if (!parsed.success) {
    const formatIssue = parsed.error.issues.some((issue) => issue.path[0] === "format");
    return {
      ok: false,
      message: formatIssue ? "Upload a JPEG, PNG, WebP or AVIF photo." : UNVERIFIED_MESSAGE,
    };
  }
  const result = parsed.data;

  if (
    !verifyResponseSignature(
      { publicId: result.public_id, version: result.version, signature: result.signature },
      credentials.apiSecret,
    )
  ) {
    return { ok: false, message: UNVERIFIED_MESSAGE };
  }

  const prefix = `https://res.cloudinary.com/${credentials.cloudName}/image/upload/`;
  if (!result.secure_url.startsWith(prefix)) return { ok: false, message: UNVERIFIED_MESSAGE };
  let rest: string;
  try {
    rest = decodeURIComponent(result.secure_url.slice(prefix.length));
  } catch {
    return { ok: false, message: UNVERIFIED_MESSAGE };
  }
  const expected = `v${result.version}/${result.public_id}`;
  if (
    rest !== expected &&
    !(rest.startsWith(`${expected}.`) && /^\.[a-z0-9]{2,5}$/i.test(rest.slice(expected.length)))
  ) {
    return { ok: false, message: UNVERIFIED_MESSAGE };
  }

  if (result.bytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: "That photo is larger than 15 MB. Export a smaller JPEG and upload it again.",
    };
  }

  return {
    ok: true,
    upload: {
      publicId: result.public_id,
      version: result.version,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      url: result.secure_url,
      color: predominantColor(result.colors),
    },
  };
}

/**
 * The first usable colour from Cloudinary's `colors` list (most prominent first),
 * as lower-case "#rrggbb". Colours with transparency ("#rrggbbaa") lose the alpha.
 */
export function predominantColor(colors: unknown): string | null {
  if (!Array.isArray(colors)) return null;
  for (const entry of colors.slice(0, 64)) {
    const value: unknown = Array.isArray(entry) ? entry[0] : null;
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value))
      return value.slice(0, 7).toLowerCase();
  }
  return null;
}
