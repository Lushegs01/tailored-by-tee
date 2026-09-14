"use client";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/text-link";

import { useListing } from "./listing-provider";

/** No results: with filters on, the way out is clearing them; otherwise the full collection. */
export function ListingEmpty({ filtered }: { filtered: boolean }) {
  const { clearFilters } = useListing();

  return (
    <EmptyState
      as="h3"
      size="sm"
      className="py-20 md:py-28"
      title={filtered ? "Nothing matches *this edit.*" : "Nothing here *just yet.*"}
      body={
        filtered
          ? "Try removing a filter or two, or browse everything currently in the studio."
          : "New pieces arrive from the studio regularly. In the meantime, browse the full collection."
      }
      actions={
        <>
          {filtered ? <Button onClick={clearFilters}>Clear filters</Button> : null}
          <TextLink href="/shop">Shop all pieces</TextLink>
        </>
      }
    />
  );
}
