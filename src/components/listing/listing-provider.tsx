"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CLEARED_FILTERS, listingHref, type ListingParams } from "@/lib/catalog/listing-params";
import type { ProductSort } from "@/lib/catalog/types";

/*
 * Client state for one product listing. The URL is the source of truth: the page
 * renders on the server from its search params, and every change here is a
 * router.replace inside a transition. useOptimistic reflects the change at once,
 * so a ticked box never waits on the network while the results dim until the
 * new page arrives.
 */

export interface ListingContextValue {
  basePath: string;
  /** Current state, including a change that is still on its way. */
  params: ListingParams;
  /** The order used when `params.sort` is null. */
  defaultSort: ProductSort;
  /** Matching pieces for the last rendered state. */
  total: number;
  isPending: boolean;
  /** Apply a change. Anything other than a page change returns to page 1. */
  update: (change: Partial<ListingParams>) => void;
  clearFilters: () => void;
  /** The results region: brought into view after a change, and focus lands here when needed. */
  resultsRef: React.RefObject<HTMLDivElement | null>;
}

const ListingContext = React.createContext<ListingContextValue | null>(null);

/** If the top of the results has scrolled above the header, bring it back under it. */
function bringIntoView(element: HTMLElement | null) {
  if (!element) return;
  const offset = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const top = element.getBoundingClientRect().top;
  if (top >= offset) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: window.scrollY + top - offset, behavior: reduceMotion ? "auto" : "smooth" });
}

export interface ListingProviderProps {
  basePath: string;
  params: ListingParams;
  defaultSort: ProductSort;
  total: number;
  children: React.ReactNode;
}

export function ListingProvider({ basePath, params, defaultSort, total, children }: ListingProviderProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useOptimistic(params);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  const update = React.useCallback(
    (change: Partial<ListingParams>) => {
      const next: ListingParams = { ...optimistic, page: 1, ...change };
      bringIntoView(resultsRef.current);
      startTransition(() => {
        setOptimistic(next);
        router.replace(listingHref(basePath, next), { scroll: false });
      });
    },
    [optimistic, basePath, router, setOptimistic],
  );

  const clearFilters = React.useCallback(() => update(CLEARED_FILTERS), [update]);

  const value = React.useMemo<ListingContextValue>(
    () => ({ basePath, params: optimistic, defaultSort, total, isPending, update, clearFilters, resultsRef }),
    [basePath, optimistic, defaultSort, total, isPending, update, clearFilters],
  );

  return <ListingContext value={value}>{children}</ListingContext>;
}

export function useListing() {
  const context = React.useContext(ListingContext);
  if (!context) throw new Error("useListing must be used within <ListingProvider>");
  return context;
}
