"use client";

import * as React from "react";
import Link from "next/link";
import type { Variants } from "motion/react";
import * as m from "motion/react-m";

import { TextLink } from "@/components/ui/text-link";
import type { SearchResults } from "@/lib/catalog/types";
import { DURATION, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { searchPageHref } from "./search-config";
import { SEARCH_ITEM_ATTR } from "./search-keyboard";
import { SearchProductResult } from "./search-product-result";

const itemAttr = { [SEARCH_ITEM_ATTR]: "" };

/* A quick, low-amplitude settle — results should feel instant, not staged. */
const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_EDITORIAL } },
};

export function isEmptyResults(results: SearchResults) {
  return results.products.length + results.categories.length + results.collections.length === 0;
}

export function describeResults(results: SearchResults) {
  const pieces = results.products.length;
  const places = results.categories.length + results.collections.length;
  if (pieces + places === 0) return `Nothing matched “${results.query}”.`;
  const parts = [
    pieces ? `${pieces} ${pieces === 1 ? "piece" : "pieces"}` : null,
    places ? `${places} ${places === 1 ? "category or collection" : "categories and collections"}` : null,
  ].filter(Boolean);
  return `${parts.join(" and ")} for “${results.query}”. Use the arrow keys to browse.`;
}

interface TermListProps {
  title: string;
  items: SearchResults["categories"];
  onPick: () => void;
  onNavigate: () => void;
}

/** Categories or collections as an editorial index of serif links. */
function TermList({ title, items, onPick, onNavigate }: TermListProps) {
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-2 text-eyebrow text-muted-foreground">
        {title}
      </h3>
      <m.ul variants={listVariants} initial="hidden" animate="show" className="flex flex-col items-start">
        {items.map((item) => (
          <m.li key={item.slug} variants={itemVariants}>
            <Link
              href={item.href}
              prefetch={false}
              onClick={onPick}
              onNavigate={onNavigate}
              {...itemAttr}
              className="inline-flex min-h-11 items-center font-display text-display-xs text-foreground"
            >
              <span className="link-underline">{item.name}</span>
            </Link>
          </m.li>
        ))}
      </m.ul>
    </section>
  );
}

export interface SearchResultsViewProps {
  results: SearchResults;
  /** What is in the field now — may be ahead of `results.query` while loading. */
  query: string;
  /** Record a term as a recent search. */
  onPick: (term: string) => void;
  onNavigate: () => void;
}

/** Categories and collections on the left; up to six pieces on the right. */
export function SearchResultsView({ results, query, onPick, onNavigate }: SearchResultsViewProps) {
  const productsHeadingId = React.useId();
  const { products, categories, collections } = results;
  const hasTerms = categories.length + collections.length > 0;
  const pickResult = () => onPick(results.query);

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-(--gutter)">
      {hasTerms ? (
        <div className="grid grid-cols-2 content-start gap-8 lg:col-span-3 lg:grid-cols-1 lg:gap-10">
          {categories.length ? (
            <TermList title="Categories" items={categories} onPick={pickResult} onNavigate={onNavigate} />
          ) : null}
          {collections.length ? (
            <TermList title="Collections" items={collections} onPick={pickResult} onNavigate={onNavigate} />
          ) : null}
        </div>
      ) : null}

      <div className={cn(hasTerms ? "lg:col-span-9" : "lg:col-span-12")}>
        {products.length ? (
          <section aria-labelledby={productsHeadingId}>
            <h3 id={productsHeadingId} className="mb-3 text-eyebrow text-muted-foreground">
              Pieces
            </h3>
            <m.ul
              variants={listVariants}
              initial="hidden"
              animate="show"
              className="grid gap-x-(--gutter) gap-y-1 md:grid-cols-2"
            >
              {products.map((product) => (
                <m.li key={product.id} variants={itemVariants}>
                  <SearchProductResult product={product} onPick={pickResult} onNavigate={onNavigate} />
                </m.li>
              ))}
            </m.ul>
          </section>
        ) : (
          <p className="text-body text-muted-foreground">No pieces matched “{results.query}”.</p>
        )}

        {query ? (
          <TextLink
            href={searchPageHref(query)}
            prefetch={false}
            onClick={() => onPick(query)}
            onNavigate={onNavigate}
            {...itemAttr}
            className="mt-8 min-h-11 max-w-full"
          >
            <span className="break-words">View all results for “{query}”</span>
          </TextLink>
        ) : null}
      </div>
    </div>
  );
}
