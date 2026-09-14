"use client";

import type { ProductFacets } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { FilterSheet } from "./filter-sheet";
import { useListing } from "./listing-provider";
import { SortSelect } from "./sort-select";

export interface ListingToolbarProps {
  /** Null on listings without filters (sort only). */
  facets: ProductFacets | null;
  showCollection: boolean;
}

/**
 * Hairline bar above the results: filter trigger (below lg), live count, sort.
 * On phones the filter trigger and sort share the bar and the count drops to its
 * own line beneath, so nothing is squeezed off the edge.
 */
export function ListingToolbar({ facets, showCollection }: ListingToolbarProps) {
  const { total } = useListing();
  const count = pluralize(total, "piece");

  return (
    <div>
      <div className="flex min-h-14 items-center justify-between gap-4 border-y">
        <div className="flex min-w-0 items-center gap-5">
          {facets ? (
            <div className="lg:hidden">
              <FilterSheet facets={facets} showCollection={showCollection} />
            </div>
          ) : null}
          {/* The one live region for the count; visually hidden on phones when the line below shows it. */}
          <p
            role="status"
            className={cn(
              "whitespace-nowrap text-caption tabular-nums text-muted-foreground",
              facets && "sr-only sm:not-sr-only",
            )}
          >
            {count}
          </p>
        </div>
        <SortSelect />
      </div>
      {facets ? (
        <p aria-hidden="true" className="pt-3 text-caption tabular-nums text-muted-foreground sm:hidden">
          {count}
        </p>
      ) : null}
    </div>
  );
}
