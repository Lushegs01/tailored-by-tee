import "server-only";

import { createHash, randomBytes } from "node:crypto";

/*
 * Private order links. Order numbers are sequential and easy to guess, so an
 * order page opens only with a random secret carried in its link. The database
 * keeps a SHA-256 of that secret, never the secret itself: a leaked table can't
 * be turned back into working links.
 */

export function hashOrderAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOrderAccessToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashOrderAccessToken(token) };
}

export function orderStatusPath(orderNumber: string, token: string): string {
  return `/checkout/complete/${encodeURIComponent(orderNumber)}?key=${encodeURIComponent(token)}`;
}
