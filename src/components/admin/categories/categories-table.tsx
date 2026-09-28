import { moveCategoryAction } from "@/app/admin/categories/actions";
import { pieces } from "@/components/admin/collections/collection-copy";
import { ReorderButtons } from "@/components/admin/collections/reorder-buttons";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { DataTable, RowHeader, RowLink, StatusBadge, TBody, Td, Th, THead, Tr } from "@/components/admin/ui";
import type { AdminCategoryRow } from "@/lib/admin/categories";

import { categoryVisibility } from "./category-copy";

/**
 * Every category in the shop's order: photo, name and address, SKU code, pieces,
 * and move up/down. Rows open the editor. Phones get stacked rows.
 */
export function CategoriesTable({ categories }: { categories: AdminCategoryRow[] }) {
  return (
    <DataTable caption="Categories, in the order the shop shows them">
      <THead>
        <Tr>
          <Th>Category</Th>
          <Th>Code</Th>
          <Th>In the shop</Th>
          <Th align="end">Products</Th>
          <Th align="end">Order</Th>
        </Tr>
      </THead>
      <TBody>
        {categories.map((category, index) => {
          const visibility = categoryVisibility(category.liveProductCount);
          return (
            <Tr key={category.id} interactive>
              <RowHeader>
                <div className="flex items-start gap-3">
                  <div className="w-10 shrink-0">
                    {category.image ? (
                      <MediaThumb media={category.image} alt="" sizes="2.5rem" />
                    ) : (
                      <div aria-hidden="true" className="aspect-4/5 border border-dashed" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <RowLink href={`/admin/categories/${encodeURIComponent(category.id)}`} className="break-words">
                      {category.name}
                    </RowLink>
                    <p className="mt-0.5 font-mono text-caption font-normal break-all text-muted-foreground">
                      /shop/{category.slug}
                    </p>
                  </div>
                </div>
              </RowHeader>
              <Td label="Code">
                <span className="font-mono">{category.code}</span>
              </Td>
              <Td label="In the shop">
                <StatusBadge tone={visibility.tone}>{visibility.label}</StatusBadge>
              </Td>
              <Td label="Products" align="end">
                <span className="tabular-nums">{category.productCount}</span>
                <span className="block text-caption text-muted-foreground max-md:inline max-md:pl-2">
                  {category.productCount === 0 ? "none yet" : `${pieces(category.liveProductCount)} live`}
                </span>
              </Td>
              <Td label="Order" align="end">
                <div className="relative z-10 flex items-center justify-end gap-3">
                  <span className="text-caption text-muted-foreground tabular-nums">
                    <span className="sr-only">Position </span>
                    {index + 1}
                  </span>
                  <ReorderButtons
                    itemName={category.name}
                    index={index}
                    count={categories.length}
                    move={moveCategoryAction.bind(null, category.id)}
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
