"use client";

import * as React from "react";

import { normaliseQuery } from "./search-config";

/*
 * Recent searches, persisted per browser. A tiny external store (rather than
 * component state) keeps every subscriber and other tabs in sync, and keeps
 * working in memory when storage is unavailable (private mode, quota).
 */

const STORAGE_KEY = "tbt.search.recent.v1";
const MAX_RECENT = 6;
const EMPTY: readonly string[] = [];

let current: readonly string[] | null = null;
const listeners = new Set<() => void>();

function load(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normaliseQuery)
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return EMPTY;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function commit(next: readonly string[]) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — the in-memory copy still serves this session.
  }
  emit();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  current = load();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): readonly string[] {
  if (current === null) current = load();
  return current;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

const sameTerm = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export interface RecentSearches {
  /** Most recent first, at most six. */
  items: readonly string[];
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
}

export function useRecentSearches(): RecentSearches {
  const items = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = React.useCallback((term: string) => {
    const value = normaliseQuery(term);
    if (!value) return;
    const rest = getSnapshot().filter((item) => !sameTerm(item, value));
    commit([value, ...rest].slice(0, MAX_RECENT));
  }, []);

  const remove = React.useCallback((term: string) => {
    commit(getSnapshot().filter((item) => !sameTerm(item, term)));
  }, []);

  const clear = React.useCallback(() => commit(EMPTY), []);

  return { items, add, remove, clear };
}
