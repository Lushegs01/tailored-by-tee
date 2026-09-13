"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

import { searchPageHref } from "./search-config";
import { SearchError, SearchEmpty } from "./search-feedback";
import { SearchField } from "./search-field";
import { SearchIdle } from "./search-idle";
import { SEARCH_ITEM_ATTR, focusFirstSearchItem, moveSearchFocus } from "./search-keyboard";
import { describeResults, isEmptyResults, SearchResultsView } from "./search-results";
import { useSearch } from "./search-provider";
import { useRecentSearches } from "./use-recent-searches";
import { useSearchQuery } from "./use-search-query";

export interface SearchPanelProps {
  /** Owned by the overlay so the sheet can focus the field as it opens. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Everything inside the search sheet. Mounted on open, so each visit starts
 * from a clean field; recent searches and cached answers persist between visits.
 */
export function SearchPanel({ inputRef }: SearchPanelProps) {
  const { close } = useSearch();
  const router = useRouter();
  const recent = useRecentSearches();
  const [value, setValue] = React.useState("");
  const { query, status, results, retry } = useSearchQuery(value);

  const bodyRef = React.useRef<HTMLDivElement>(null);
  const regionId = React.useId();

  const focusInput = () => inputRef.current?.focus();

  function choose(term: string) {
    setValue(term);
    focusInput();
  }

  function clearField() {
    setValue("");
    focusInput();
  }

  function submit() {
    if (!query) return;
    recent.add(query);
    close();
    router.push(searchPageHref(query));
  }

  function handleArrowDown() {
    focusFirstSearchItem(bodyRef.current);
  }

  /* Arrow keys move between items; typing from an item returns to the field. */
  function handleBodyKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute(SEARCH_ITEM_ATTR)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const outcome = moveSearchFocus(bodyRef.current, target, event.key);
    if (outcome !== "ignored") {
      event.preventDefault();
      if (outcome === "exit-top") focusInput();
      return;
    }
    if (event.key.length === 1 && event.key !== " ") focusInput();
  }

  const isLoading = status === "loading";
  const announcement =
    status === "loading"
      ? "Searching…"
      : status === "error"
        ? "Search is unavailable at the moment."
        : status === "success" && results
          ? describeResults(results)
          : "";

  let content: React.ReactNode = null;
  if (status === "idle") {
    content = (
      <SearchIdle
        recent={recent.items}
        onChoose={choose}
        onRemoveRecent={recent.remove}
        onClearRecent={recent.clear}
        onFocusInput={focusInput}
      />
    );
  } else if (status === "error") {
    content = <SearchError onRetry={retry} />;
  } else if (results && isEmptyResults(results)) {
    content = <SearchEmpty query={results.query} onChoose={choose} />;
  } else if (results) {
    // Keyed by the settled query so each new answer settles in, while the previous one stays up during loading.
    content = (
      <SearchResultsView
        key={results.query}
        results={results}
        query={query}
        onPick={recent.add}
        onNavigate={close}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchField
        inputRef={inputRef}
        value={value}
        onValueChange={setValue}
        onSubmit={submit}
        onClear={clearField}
        onArrowDown={handleArrowDown}
        controlsId={regionId}
      />

      <div
        ref={bodyRef}
        id={regionId}
        role="region"
        aria-label="Search suggestions and results"
        onKeyDown={handleBodyKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:min-h-80"
      >
        <Container className="pb-12 pt-5 md:pb-16 md:pt-6">
          <div className="mb-6 flex h-5 items-center">
            {/* Visible hint only when a request is genuinely slow; quick answers never flash it. */}
            <span
              aria-hidden="true"
              className={cn(
                "text-caption text-muted-foreground transition-opacity duration-300 ease-editorial",
                isLoading ? "opacity-100 delay-200" : "opacity-0",
              )}
            >
              Searching…
            </span>
            <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {announcement}
            </p>
          </div>
          {content}
        </Container>
      </div>
    </div>
  );
}
