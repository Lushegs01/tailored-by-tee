/**
 * Search vocabulary shared by the overlay (client) and /api/search (server).
 * Plain module — no client or server-only imports — so both sides agree on limits.
 */

export const MAX_QUERY_LENGTH = 64;
export const DEFAULT_RESULT_LIMIT = 6;
export const MAX_RESULT_LIMIT = 12;

/** Quiet, curated starting points shown before the client types anything. */
export const SUGGESTED_SEARCHES = [
  "Linen",
  "Overshirt",
  "Knitwear",
  "Tailoring",
  "Denim",
  "Accessories",
] as const;

/** Trims, collapses inner whitespace and caps length — the canonical form of a query. */
export function normaliseQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
}

/** The full results page (arrives in Phase 2). */
export function searchPageHref(query: string): string {
  return `/search?q=${encodeURIComponent(normaliseQuery(query))}`;
}
