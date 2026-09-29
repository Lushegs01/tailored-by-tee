import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/admin/image-probe";

/*
 * Checks and wording for the upload form, in the browser. Pure. The server
 * re-checks everything (lib/admin/cloudinary-sign checkUploadResult); these only
 * save the owner a pointless upload.
 */

const ACCEPTED_EXTENSION = /\.(jpe?g|png|webp|avif)$/i;

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`;
}

/** Null when the file can be uploaded, otherwise what to do instead. */
export function checkUploadFile(file: { name: string; type: string; size: number }): string | null {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif" || /\.hei[cf]$/i.test(file.name)) {
    return "This is an iPhone (HEIC) photo, which browsers can’t show. Choose it again from your Photos app, or export it as a JPEG first.";
  }
  const accepted =
    (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(type) ||
    (type === "" && ACCEPTED_EXTENSION.test(file.name));
  if (!accepted) return "Choose a JPEG, PNG, WebP or AVIF photo.";
  if (file.size === 0) return "That file is empty. Choose the photo again.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `This photo is ${megabytes(file.size)}; the limit is ${megabytes(MAX_UPLOAD_BYTES)}. Export a smaller JPEG and try again.`;
  }
  return null;
}

/**
 * Cloudinary's error for a failed upload, as something the owner can act on.
 * `message` is Cloudinary's own text (error.message in its JSON reply).
 */
export function describeUploadError(status: number, message: string | null): string {
  const text = message?.trim() ?? "";
  if (status === 0) return "The upload was interrupted. Check your connection and try again.";
  if (/file size too large/i.test(text)) {
    return "This photo is bigger than your Cloudinary plan allows (10 MB on the free plan). Export a smaller JPEG and try again.";
  }
  if (/format|not allowed|invalid image/i.test(text))
    return "Cloudinary couldn’t read this file. Upload a JPEG, PNG, WebP or AVIF photo.";
  if (/stale request|timestamp/i.test(text)) return "The upload took too long to start. Please try again.";
  if (status === 401 || /signature|api[ _]key/i.test(text)) {
    return "Cloudinary refused the upload because its keys don’t match. Check the Cloudinary settings, then try again.";
  }
  if (status === 420 || status === 429)
    return "Cloudinary is limiting uploads for a moment. Wait a minute and try again.";
  if (status >= 500) return "Cloudinary had a problem receiving the photo. Please try again.";
  return text
    ? `Cloudinary didn’t accept this photo: ${text.slice(0, 200)}`
    : "The upload didn’t finish. Please try again.";
}

/** Only the fields of Cloudinary's reply the server needs to verify and save an upload. */
export function pickUploadReply(reply: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "public_id",
    "version",
    "signature",
    "width",
    "height",
    "format",
    "resource_type",
    "type",
    "bytes",
    "secure_url",
  ];
  const picked: Record<string, unknown> = Object.fromEntries(
    keys.filter((key) => key in reply).map((key) => [key, reply[key]]),
  );
  if (Array.isArray(reply.colors)) picked.colors = reply.colors.slice(0, 8);
  return picked;
}
