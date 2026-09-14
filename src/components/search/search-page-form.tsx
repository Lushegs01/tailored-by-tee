import Form from "next/form";

import { SearchIcon } from "@/components/icons";

import { MAX_QUERY_LENGTH } from "./search-config";

/**
 * The results page's own search field. A GET form (via next/form), so it works
 * before hydration and submits as a client-side navigation after it.
 */
export function SearchPageForm({ defaultValue }: { defaultValue: string }) {
  return (
    <Form
      action="/search"
      role="search"
      className="flex items-center gap-4 border-b border-foreground pb-1 transition-shadow duration-300 focus-within:shadow-[0_1px_0_0_var(--foreground)]"
    >
      <SearchIcon aria-hidden="true" className="shrink-0 text-2xl text-muted-foreground" />
      <label htmlFor="search-page-query" className="sr-only">
        Search the collection
      </label>
      <input
        // Re-mount when the query changes so the field shows what was searched.
        key={defaultValue}
        id="search-page-query"
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Search pieces, colours, cloth…"
        autoComplete="off"
        enterKeyHint="search"
        className="h-14 min-w-0 flex-1 bg-transparent font-display text-display-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none md:h-16"
      />
      <button type="submit" className="inline-flex min-h-11 shrink-0 items-center text-label">
        <span className="link-underline-static pb-1">Search</span>
      </button>
    </Form>
  );
}
