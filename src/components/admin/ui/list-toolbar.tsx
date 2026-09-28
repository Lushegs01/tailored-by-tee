"use client";

import { useEffect, useId, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CloseIcon, SearchIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { adminSelectClassName } from "./field-styles";
import { SelectChevron } from "./fields";

export interface ListToolbarFilter {
  /** The URL parameter, e.g. "status". Must be in the page's parseListParams allow-list. */
  name: string;
  /** Accessible name, e.g. "Order status". */
  label: string;
  options: readonly { value: string; label: string }[];
  /** The "no filter" option, e.g. "All statuses". */
  allLabel: string;
}

export interface ListToolbarProps {
  /** Hide the search box for lists that can't be searched. */
  search?: boolean;
  /** Accessible name for the search box. Default "Search". */
  searchLabel?: string;
  /** e.g. "Order number, name or email" */
  searchPlaceholder?: string;
  filters?: readonly ListToolbarFilter[];
  /** Extra controls at the end of the toolbar (e.g. an export link). */
  children?: ReactNode;
  className?: string;
}

const SEARCH_DELAY_MS = 350;

/**
 * Search and filters for an admin list. The URL is the source of truth: typing
 * updates ?q= after a short pause, choosing a filter updates its parameter at
 * once, and both go back to page 1 while keeping the sort and other filters. The
 * server page re-renders from the new URL (parseListParams).
 */
export function ListToolbar({
  search = true,
  searchLabel = "Search",
  searchPlaceholder = "Search",
  filters = [],
  children,
  className,
}: ListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const searchId = useId();

  // The latest query string, including navigations still in flight.
  const latest = useRef(searchParams.toString());
  useEffect(() => {
    latest.current = searchParams.toString();
  }, [searchParams]);

  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  // The URL's q at the last render, and the q this toolbar last asked for. When the
  // URL's q changes to something the toolbar didn't ask for (back button, a link),
  // the box follows the URL; a change it did ask for leaves the box alone, so
  // anything typed while the list was loading is kept.
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [expectedQuery, setExpectedQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (!pending && urlQuery !== expectedQuery) {
      setExpectedQuery(urlQuery);
      setQuery(urlQuery);
    }
  }

  const urlFilters = Object.fromEntries(filters.map((filter) => [filter.name, searchParams.get(filter.name) ?? ""]));
  const [shownFilters, setShownFilters] = useOptimistic(urlFilters);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(latest.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const queryString = next.toString();
    latest.current = queryString;
    const filterChanges = Object.fromEntries(
      Object.entries(changes).filter(([key]) => filters.some((filter) => filter.name === key)),
    );
    startTransition(() => {
      if (Object.keys(filterChanges).length > 0) {
        setShownFilters((current) => ({ ...current, ...mapNullToEmpty(filterChanges) }));
      }
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    });
  }

  function searchNow(value: string) {
    clearTimeout(timer.current);
    const text = value.trim();
    if (text === (new URLSearchParams(latest.current).get("q") ?? "")) return;
    setExpectedQuery(text);
    navigate({ q: text || null });
  }

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => searchNow(value), SEARCH_DELAY_MS);
  }

  const active = urlQuery !== "" || Object.values(shownFilters).some(Boolean);

  function clearAll() {
    clearTimeout(timer.current);
    setQuery("");
    setExpectedQuery("");
    navigate(Object.fromEntries([["q", null], ...filters.map((filter) => [filter.name, null])]));
  }

  return (
    <div
      aria-busy={pending || undefined}
      className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}
    >
      {search ? (
        <form
          role="search"
          className="relative w-full sm:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            searchNow(query);
          }}
        >
          <label htmlFor={searchId} className="sr-only">
            {searchLabel}
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
                searchNow("");
              }
            }}
            className="h-10 pr-10 pl-9 text-body-sm"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                setQuery("");
                searchNow("");
              }}
              className="absolute top-1/2 right-0 inline-flex size-10 -translate-y-1/2 items-center justify-center text-base text-muted-foreground transition-colors hover:text-foreground"
            >
              <CloseIcon />
            </button>
          ) : null}
        </form>
      ) : null}

      {filters.map((filter) => (
        <FilterSelect
          key={filter.name}
          filter={filter}
          value={shownFilters[filter.name] ?? ""}
          onChange={(value) => navigate({ [filter.name]: value || null })}
        />
      ))}

      {active ? (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex min-h-10 items-center self-start text-body-sm text-foreground sm:self-auto"
        >
          <span className="link-underline-static pb-0.5">Clear filters</span>
        </button>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {pending ? "Updating the list" : ""}
      </p>

      {children ? <div className="flex flex-wrap items-center gap-3 sm:ml-auto">{children}</div> : null}
    </div>
  );
}

function mapNullToEmpty(changes: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value ?? ""]));
}

function FilterSelect({
  filter,
  value,
  onChange,
}: {
  filter: ListToolbarFilter;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  // An unknown value in the URL (ignored by the server) shows as "all".
  const known = filter.options.some((option) => option.value === value) ? value : "";

  return (
    <div className="relative w-full sm:w-auto">
      <label htmlFor={id} className="sr-only">
        {filter.label}
      </label>
      <select
        id={id}
        value={known}
        onChange={(event) => onChange(event.target.value)}
        className={cn(adminSelectClassName, "sm:w-auto sm:min-w-40", known && "border-foreground")}
      >
        <option value="">{filter.allLabel}</option>
        {filter.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <SelectChevron />
    </div>
  );
}
