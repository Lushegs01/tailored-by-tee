import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  DEFAULT_RESULT_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_RESULT_LIMIT,
  normaliseQuery,
} from "@/components/search/search-config";
import { searchCatalog } from "@/lib/catalog/repository";
import type { SearchResults } from "@/lib/catalog/types";

/*
 * GET /api/search?q=&limit=
 * Typeahead endpoint for the search overlay. Results are identical for every
 * visitor, so they are safe to cache at the edge for a minute.
 */

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

const querySchema = z.object({
  q: z
    .string()
    .trim()
    .max(MAX_QUERY_LENGTH, `Search terms are limited to ${MAX_QUERY_LENGTH} characters.`)
    .default(""),
  limit: z.coerce
    .number({ error: "Limit must be a whole number." })
    .int("Limit must be a whole number.")
    .min(1, "Limit must be at least 1.")
    .max(MAX_RESULT_LIMIT, `Limit must be ${MAX_RESULT_LIMIT} or fewer.`)
    .default(DEFAULT_RESULT_LIMIT),
});

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Empty parameters (`?limit=`) fall back to defaults rather than failing validation.
  const parsed = querySchema.safeParse({
    q: params.get("q") ?? undefined,
    limit: params.get("limit") || undefined,
  });

  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid search request.", 400);
  }

  const query = normaliseQuery(parsed.data.q);
  const empty: SearchResults = { query, products: [], categories: [], collections: [] };

  try {
    const results = query ? await searchCatalog(query, parsed.data.limit) : empty;
    return Response.json(results, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("[api/search] searchCatalog failed", error);
    return errorResponse("Search is unavailable at the moment.", 500);
  }
}
