"use client";

import * as React from "react";

import { FilterIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { countActiveFilters } from "@/lib/catalog/listing-params";
import type { ProductFacets } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";

import { FilterForm } from "./filter-form";
import { useListing } from "./listing-provider";

export interface FilterSheetProps {
  facets: ProductFacets;
  showCollection: boolean;
}

/**
 * Filters below lg: a trigger in the toolbar and a drawer holding the same form
 * as the desktop rail. Changes apply live behind the drawer; its footer reports
 * how many pieces remain, so closing it is the confirmation.
 */
export function FilterSheet({ facets, showCollection }: FilterSheetProps) {
  const [open, setOpen] = React.useState(false);
  const { params, total, isPending, clearFilters } = useListing();
  const active = countActiveFilters(params);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="-ml-1 inline-flex h-11 items-center gap-2.5 px-1 text-label transition-opacity duration-300 hover:opacity-60"
      >
        <FilterIcon aria-hidden="true" className="text-lg" />
        Filter
        {active > 0 ? (
          <span className="tabular-nums text-muted-foreground">
            <span aria-hidden="true">({active})</span>
            <span className="sr-only">, {active} active</span>
          </span>
        ) : null}
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="left"
        title="Filter"
        bodyClassName="px-6"
        footer={
          <div className="grid grid-cols-[auto_1fr] gap-3 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" onClick={clearFilters} disabled={active === 0}>
              Clear
            </Button>
            <Button onClick={() => setOpen(false)} aria-busy={isPending || undefined}>
              {isPending ? "Updating…" : total === 0 ? "No pieces match" : `Show ${pluralize(total, "piece")}`}
            </Button>
          </div>
        }
      >
        <FilterForm facets={facets} showCollection={showCollection} variant="sheet" />
      </Sheet>
    </>
  );
}
