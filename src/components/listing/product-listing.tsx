import type { ReactNode } from "react";

import { ProductGrid } from "@/components/product/product-grid";
import { countActiveFilters, type ListingParams } from "@/lib/catalog/listing-params";
import type { ProductFacets, ProductListResult, ProductSort } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

import { ActiveFilters } from "./active-filters";
import { CategoryNav } from "./category-nav";
import { FilterForm } from "./filter-form";
import { ListingEmpty } from "./listing-empty";
import { ListingPagination } from "./listing-pagination";
import { ListingProvider } from "./listing-provider";
import { ListingResults } from "./listing-results";
import { ListingToolbar } from "./listing-toolbar";
import type { CategoryNavItem } from "./types";

export interface ProductListingProps {
  basePath: string;
  params: ListingParams;
  defaultSort: ProductSort;
  result: ProductListResult;
  /** Filter options. Null gives a sort-only listing (e.g. an editorial collection). */
  facets: ProductFacets | null;
  /** Offer collection as a filter — off where the collection is the page. */
  showCollectionFacet?: boolean;
  /** Category links at the top of the desktop filter rail. */
  categoryNav?: CategoryNavItem[];
  /** How many leading cards preload (first row when the grid starts above the fold). */
  preloadCount?: number;
  /** Visually hidden heading for the results; null when the page shows its own. */
  resultsHeading?: string | null;
  /** Replaces the default empty state. */
  emptyState?: ReactNode;
}

/** Cards shrink beside the rail: 2-up phones, 3-up from md, 4-up from 2xl. */
const RAIL_GRID_SIZES =
  "(min-width: 1920px) 400px, (min-width: 1536px) 20vw, (min-width: 1024px) 23vw, (min-width: 768px) 31vw, 48vw";

/**
 * A complete product listing: filter rail (desktop) or drawer (below lg), toolbar,
 * active filters, results and pagination. Server-rendered from the URL; the client
 * pieces only turn interactions into new URLs.
 */
export function ProductListing({
  basePath,
  params,
  defaultSort,
  result,
  facets,
  showCollectionFacet = false,
  categoryNav,
  preloadCount = 0,
  resultsHeading = "Pieces",
  emptyState,
}: ProductListingProps) {
  const withRail = facets !== null;
  const filtered = countActiveFilters(params) > 0;

  return (
    <ListingProvider basePath={basePath} params={params} defaultSort={defaultSort} total={result.total}>
      <div className={cn(withRail && "lg:grid lg:grid-cols-12 lg:gap-x-8 xl:gap-x-12")}>
        {withRail ? (
          <aside aria-label="Filters" className="hidden lg:col-span-3 lg:block 2xl:col-span-2">
            <div className="sticky top-[calc(var(--header-height)+1.5rem)] max-h-[calc(100dvh-var(--header-height)-3rem)] overflow-y-auto overscroll-contain pr-3 pb-10 scrollbar-none">
              {categoryNav ? <CategoryNav items={categoryNav} variant="rail" /> : null}
              <FilterForm facets={facets} showCollection={showCollectionFacet} variant="rail" />
            </div>
          </aside>
        ) : null}

        <div className={cn(withRail && "lg:col-span-9 2xl:col-span-10")}>
          <ListingToolbar facets={facets} showCollection={showCollectionFacet} />
          {facets ? <ActiveFilters facets={facets} /> : null}

          <ListingResults>
            {resultsHeading ? <h2 className="sr-only">{resultsHeading}</h2> : null}
            {result.items.length > 0 ? (
              <ProductGrid
                products={result.items}
                columns={withRail ? 3 : 4}
                sizes={withRail ? RAIL_GRID_SIZES : undefined}
                className={cn("mt-8 md:mt-10", withRail && "2xl:grid-cols-4")}
                preloadCount={preloadCount}
                headingLevel="h3"
                animate={false}
              />
            ) : (
              (emptyState ?? <ListingEmpty filtered={filtered} />)
            )}
          </ListingResults>

          <ListingPagination basePath={basePath} params={params} total={result.total} pageSize={result.pageSize} />
        </div>
      </div>
    </ListingProvider>
  );
}
