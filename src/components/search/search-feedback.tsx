"use client";

import { Button } from "@/components/ui/button";

import { SuggestedSearches } from "./search-idle";
import { SEARCH_ITEM_ATTR } from "./search-keyboard";

/** No matches: a plain, helpful line and somewhere else to begin. */
export function SearchEmpty({ query, onChoose }: { query: string; onChoose: (term: string) => void }) {
  return (
    <div className="grid gap-12 md:grid-cols-12 md:gap-x-(--gutter)">
      <div className="md:col-span-5 lg:col-span-4">
        <p className="font-display text-display-xs text-foreground">
          Nothing matched “<span className="break-words">{query}</span>”.
        </p>
        <p className="mt-3 text-body text-muted-foreground">Try a fabric, a colour or a category.</p>
      </div>
      <SuggestedSearches onChoose={onChoose} className="md:col-span-6 md:col-start-7 lg:col-span-5 lg:col-start-7" />
    </div>
  );
}

/** The request failed (network or server). Offer a single, calm way forward. */
export function SearchError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-md">
      <p className="font-display text-display-xs text-foreground">Search is unavailable at the moment.</p>
      <Button
        variant="link"
        size="inline"
        className="mt-6"
        onClick={onRetry}
        {...{ [SEARCH_ITEM_ATTR]: "" }}
      >
        Try again
      </Button>
    </div>
  );
}
