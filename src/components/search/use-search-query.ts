"use client";

import * as React from "react";

import type { SearchResults } from "@/lib/catalog/types";

import { DEFAULT_RESULT_LIMIT, normaliseQuery } from "./search-config";

/*
 * Debounced typeahead against /api/search.
 *
 * - Each request is abortable; only the latest query can settle.
 * - Previous results stay on screen while the next query loads.
 * - Answers are kept in a small session cache so backspacing is instant.
 */

const DEBOUNCE_MS = 180;
const CACHE_SIZE = 40;

const cache = new Map<string, SearchResults>();

function remember(key: string, results: SearchResults) {
  cache.delete(key);
  cache.set(key, results);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function isSearchResults(value: unknown): value is SearchResults {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof SearchResults, unknown>>;
  return (
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.collections)
  );
}

async function fetchResults(query: string, signal: AbortSignal): Promise<SearchResults> {
  const params = new URLSearchParams({ q: query, limit: String(DEFAULT_RESULT_LIMIT) });
  const response = await fetch(`/api/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Search request failed (${response.status})`);
  const data: unknown = await response.json();
  if (!isSearchResults(data)) throw new Error("Unexpected search response");
  return data;
}

export type SearchStatus = "idle" | "loading" | "success" | "error";

export interface SearchQueryState {
  /** The normalised query the status refers to. */
  query: string;
  status: SearchStatus;
  /** Latest settled results — during "loading" these are the previous query's. */
  results: SearchResults | null;
  retry: () => void;
}

interface Settled {
  query: string;
  attempt: number;
  results: SearchResults | null;
  failed: boolean;
}

const initialSettled: Settled = { query: "", attempt: 0, results: null, failed: false };

export function useSearchQuery(rawQuery: string): SearchQueryState {
  const query = normaliseQuery(rawQuery);
  const [debounced, setDebounced] = React.useState(query);
  const [attempt, setAttempt] = React.useState(0);
  const [settled, setSettled] = React.useState<Settled>(initialSettled);

  // Clearing and cached queries apply at once; fresh queries wait for a pause in typing.
  React.useEffect(() => {
    const delay = query && !cache.has(query) ? DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      setDebounced(query);
      // A cleared field starts over: the next query shouldn't inherit stale results.
      if (!query) setSettled(initialSettled);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (!debounced) return;
    const controller = new AbortController();
    const cached = cache.get(debounced);
    const request = cached ? Promise.resolve(cached) : fetchResults(debounced, controller.signal);

    request
      .then((results) => {
        remember(debounced, results);
        if (!controller.signal.aborted) {
          setSettled({ query: debounced, attempt, results, failed: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSettled({ query: debounced, attempt, results: null, failed: true });
        }
      });

    return () => controller.abort();
  }, [debounced, attempt]);

  const retry = React.useCallback(() => setAttempt((value) => value + 1), []);

  if (!query) return { query, status: "idle", results: null, retry };

  const isCurrent = settled.query === query && settled.attempt === attempt;
  if (!isCurrent) return { query, status: "loading", results: settled.results, retry };

  return settled.failed
    ? { query, status: "error", results: null, retry }
    : { query, status: "success", results: settled.results, retry };
}
