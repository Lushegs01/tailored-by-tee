"use client";

import * as React from "react";

import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

import { SUGGESTED_SEARCHES } from "./search-config";
import { SEARCH_ITEM_ATTR } from "./search-keyboard";

const itemAttr = { [SEARCH_ITEM_ATTR]: "" };

export interface SuggestedSearchesProps {
  onChoose: (term: string) => void;
  className?: string;
}

/** Curated starting points, set as quiet serif words that fill the query. */
export function SuggestedSearches({ onChoose, className }: SuggestedSearchesProps) {
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId} className={className}>
      <h3 id={headingId} className="mb-4 text-eyebrow text-muted-foreground">
        Suggested
      </h3>
      <ul className="grid grid-cols-2 gap-x-8">
        {SUGGESTED_SEARCHES.map((term) => (
          <li key={term}>
            <button
              type="button"
              {...itemAttr}
              onClick={() => onChoose(term)}
              className="inline-flex min-h-11 items-center text-left font-display text-display-xs text-foreground"
            >
              <span className="link-underline">{term}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface RecentSearchListProps {
  items: readonly string[];
  onChoose: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
  /** Where focus goes once there is nothing left to focus in the list. */
  onFocusInput: () => void;
  className?: string;
}

function RecentSearchList({ items, onChoose, onRemove, onClear, onFocusInput, className }: RecentSearchListProps) {
  const headingId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);

  // Move focus to a neighbouring control before the removed row disappears.
  function handleRemove(term: string, index: number) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-recent-remove]") ?? []);
    const neighbour = buttons[index + 1] ?? buttons[index - 1];
    if (neighbour) neighbour.focus();
    else onFocusInput();
    onRemove(term);
  }

  function handleClear() {
    onClear();
    onFocusInput();
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="mb-2 flex items-center justify-between gap-6">
        <h3 id={headingId} className="text-eyebrow text-muted-foreground">
          Recent searches
        </h3>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear recent searches"
          className="-mr-3 inline-flex min-h-11 items-center px-3 text-label text-muted-foreground transition-colors duration-300 ease-editorial hover:text-foreground"
        >
          Clear
        </button>
      </div>
      <ul ref={listRef}>
        {items.map((term, index) => (
          <li key={term} className="flex items-center justify-between gap-4">
            <button
              type="button"
              {...itemAttr}
              onClick={() => onChoose(term)}
              className="flex min-h-11 min-w-0 flex-1 items-center text-left text-body text-foreground"
            >
              <span className="link-underline truncate">{term}</span>
            </button>
            <button
              type="button"
              data-recent-remove=""
              onClick={() => handleRemove(term, index)}
              aria-label={`Remove “${term}” from recent searches`}
              title="Remove"
              className="-mr-3 inline-flex size-11 shrink-0 items-center justify-center text-[0.9375rem] text-muted-foreground transition-colors duration-300 ease-editorial hover:text-foreground"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface SearchIdleProps {
  recent: readonly string[];
  onChoose: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearRecent: () => void;
  onFocusInput: () => void;
}

/** What the overlay shows before anything is typed: recent searches and suggestions. */
export function SearchIdle({ recent, onChoose, onRemoveRecent, onClearRecent, onFocusInput }: SearchIdleProps) {
  const hasRecent = recent.length > 0;

  return (
    <div className="grid gap-12 md:grid-cols-12 md:gap-x-(--gutter)">
      {hasRecent ? (
        <RecentSearchList
          items={recent}
          onChoose={onChoose}
          onRemove={onRemoveRecent}
          onClear={onClearRecent}
          onFocusInput={onFocusInput}
          className="md:col-span-5 lg:col-span-4"
        />
      ) : null}
      <SuggestedSearches
        onChoose={onChoose}
        className={cn(
          hasRecent ? "md:col-span-6 md:col-start-7 lg:col-span-5 lg:col-start-7" : "md:col-span-7 lg:col-span-5",
        )}
      />
    </div>
  );
}
