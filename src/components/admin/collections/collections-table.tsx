import { moveCollectionAction } from "@/app/admin/collections/actions";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { DataTable, RowHeader, RowLink, StatusBadge, TBody, Td, Th, THead, Tr } from "@/components/admin/ui";
import type { AdminCollectionRow } from "@/lib/admin/collections";

import { collectionVisibility, pieces } from "./collection-copy";
import { ReorderButtons } from "./reorder-buttons";

/**
 * Every collection in the shop's order: photo, name with code and season, how it
 * shows in the shop, its pieces, and move up/down. Rows open the editor. Phones
 * get stacked rows; the page never scrolls sideways.
 */
export function CollectionsTable({ collections }: { collections: AdminCollectionRow[] }) {
  return (
    <DataTable caption="Collections, in the order the shop shows them">
      <THead>
        <Tr>
          <Th>Collection</Th>
          <Th>In the shop</Th>
          <Th align="end">Pieces</Th>
          <Th align="end">Order</Th>
        </Tr>
      </THead>
      <TBody>
        {collections.map((collection, index) => {
          const visibility = collectionVisibility({
            isPublished: collection.isPublished,
            liveCount: collection.liveProductCount,
          });
          const meta = [collection.code, collection.season].filter(Boolean).join(" · ");
          return (
            <Tr key={collection.id} interactive>
              <RowHeader>
                <div className="flex items-start gap-3">
                  <div className="w-10 shrink-0">
                    {collection.heroImage ? (
                      <MediaThumb media={collection.heroImage} alt="" sizes="2.5rem" />
                    ) : (
                      <div aria-hidden="true" className="aspect-4/5 border border-dashed" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <RowLink href={`/admin/collections/${encodeURIComponent(collection.id)}`} className="break-words">
                      {collection.name}
                    </RowLink>
                    {meta ? <p className="mt-0.5 text-caption font-normal text-muted-foreground">{meta}</p> : null}
                    <p className="mt-0.5 font-mono text-caption font-normal break-all text-muted-foreground">
                      /collections/{collection.slug}
                    </p>
                  </div>
                </div>
              </RowHeader>
              <Td label="In the shop">
                <div className="flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
                  <StatusBadge tone={visibility.tone}>{visibility.label}</StatusBadge>
                  {collection.isFeatured ? <StatusBadge tone="info">Featured</StatusBadge> : null}
                </div>
              </Td>
              <Td label="Pieces" align="end">
                <span className="tabular-nums">{collection.productCount}</span>
                <span className="block text-caption text-muted-foreground max-md:inline max-md:pl-2">
                  {collection.productCount === 0 ? "none yet" : `${pieces(collection.liveProductCount)} live`}
                </span>
              </Td>
              <Td label="Order" align="end">
                <div className="relative z-10 flex items-center justify-end gap-3">
                  <span className="text-caption text-muted-foreground tabular-nums">
                    <span className="sr-only">Position </span>
                    {index + 1}
                  </span>
                  <ReorderButtons
                    itemName={collection.name}
                    index={index}
                    count={collections.length}
                    move={moveCollectionAction.bind(null, collection.id)}
                  />
                </div>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
