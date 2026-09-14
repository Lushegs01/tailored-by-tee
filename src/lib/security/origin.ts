import "server-only";

import { headers } from "next/headers";

import { siteConfig } from "@/config/site";

/**
 * The origin this request arrived on, for links handed to third parties (the
 * Paystack return URL). Following the request keeps preview deployments and
 * localhost pointing back at themselves; falls back to the configured site URL.
 */
export async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return siteConfig.url;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocol}://${host}`;
}
