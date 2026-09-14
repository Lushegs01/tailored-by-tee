import "server-only";

import { headers } from "next/headers";

/*
 * A small in-memory sliding-window limiter for server actions. It is per server
 * instance — on serverless each warm instance keeps its own window — so it blunts
 * bursts and scripted abuse rather than enforcing a global ceiling. Swap the
 * store for a shared one (e.g. Upstash Redis) if a hard limit is ever needed.
 */

const windows = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 5_000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

export function rateLimit(key: string, { limit, windowMs }: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((time) => now - time < windowMs);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return { ok: false, retryAfterMs: windowMs - (now - hits[0]) };
  }

  hits.push(now);
  // Re-insert so the Map's order stays least-recently-used first.
  windows.delete(key);
  windows.set(key, hits);
  if (windows.size > MAX_TRACKED_KEYS) {
    const oldest = windows.keys().next().value;
    if (oldest !== undefined) windows.delete(oldest);
  }
  return { ok: true, retryAfterMs: 0 };
}

/** The caller's address as the platform reports it (Vercel sets x-forwarded-for). */
export async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "local"
  );
}
