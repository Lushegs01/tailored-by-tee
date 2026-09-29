import { MediaThumb } from "@/components/admin/media/media-thumb";
import { DataTable, RowHeader, RowLink, StatusBadge, TBody, THead, Td, Th, Tr } from "@/components/admin/ui";
import { formatAdminDateTime, formatKobo, formatNumber, formatRelative } from "@/lib/admin/format";
import { buildSortHref, sortDirectionFor, type ListParams } from "@/lib/admin/pagination";
import { PRODUCTS_PATH, productBadgeLabel, productPath } from "@/lib/admin/product-schema";
import type { AdminProductRow } from "@/lib/admin/products";
import { productStatusDisplay } from "@/lib/admin/status";

import { ProductSelectBox } from "./product-selection";

/*
 * The product list.
 *
 * Phones (below md): each row becomes a card — the photo and name, then the
 * facts one under another. From md it is a table; on a narrow tablet it scrolls
 * inside its own frame rather than pushing the page sideways. The tick box sits
 * beside the photo in both, above the row link so it stays clickable.
 */

const STOCK_WORDS = {
  in_stock: { label: "In stock", tone: "positive" as const },
  low_stock: { label: "Low stock", tone: "attention" as const },
  out_of_stock: { label: "Sold out", tone: "critical" as const },
};

export function ProductsTable({
  rows,
  params,
  now,
}: {
  rows: readonly AdminProductRow[];
  params: ListParams;
  /** Rendered on the server, so "3 hours ago" is the same for everyone on this response. */
  now: Date;
}) {
  const sort = (column: string, firstDir: "asc" | "desc") => ({
    href: buildSortHref(PRODUCTS_PATH, params, column, firstDir),
    direction: sortDirectionFor(params, column),
  });

  return (
    <DataTable caption="Products" frameClassName="md:overflow-x-auto" className="md:min-w-[52rem]">
      <THead>
        <Tr>
          <Th sort={sort("name", "asc")}>Product</Th>
          <Th>Status</Th>
          <Th className="max-lg:hidden">Category</Th>
          <Th align="end" sort={sort("price", "asc")}>
            Price
          </Th>
          <Th align="end" className="max-lg:hidden">
            Variants
          </Th>
          <Th align="end">
            Available<span className="sr-only"> to sell</span>
          </Th>
          <Th align="end" sort={sort("updated", "desc")}>
            Updated
          </Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const status = productStatusDisplay(row.status);
          const stock = STOCK_WORDS[row.stock];
          const badge = productBadgeLabel(row.badge);
          const missingPhoto = row.status === "ACTIVE" && !row.hasPrimaryImage;

          return (
            <Tr key={row.id} interactive highlight={missingPhoto}>
              <RowHeader className="font-normal md:max-w-[22rem]">
                <div className="flex items-start gap-3">
                  <ProductSelectBox id={row.id} name={row.name} />
                  <div className="w-10 shrink-0 border md:w-12">
                    {row.image ? (
                      <MediaThumb media={row.image} alt="" sizes="3rem" />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex aspect-4/5 items-center justify-center bg-surface text-caption text-muted-foreground"
                      >
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <RowLink href={productPath(row.id)} className="font-medium">
                      {row.name}
                    </RowLink>
                    <span className="mt-0.5 block font-mono text-caption text-muted-foreground">{row.code}</span>
                    {badge || row.isFeatured ? (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {badge ? <StatusBadge tone="info">{badge}</StatusBadge> : null}
                        {row.isFeatured ? <StatusBadge tone="neutral">Featured</StatusBadge> : null}
                      </span>
                    ) : null}
                  </div>
                </div>
              </RowHeader>

              <Td label="Status">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {missingPhoto ? (
                  <span className="mt-1.5 block text-caption text-danger">
                    Hidden from the shop: it has no main photo.
                  </span>
                ) : null}
              </Td>

              <Td label="Category" className="max-lg:hidden">
                {row.category.name}
              </Td>

              <Td label="Price" align="end">
                {formatKobo(row.price)}
                {row.compareAtPrice !== null && row.compareAtPrice > row.price ? (
                  <span className="mt-0.5 block text-caption text-muted-foreground">
                    <span className="sr-only">Original price </span>
                    <s className="decoration-1">{formatKobo(row.compareAtPrice)}</s>
                  </span>
                ) : null}
              </Td>

              <Td label="Variants" align="end" className="max-lg:hidden">
                {row.variantCount === 0 ? (
                  <span className="text-muted-foreground">None yet</span>
                ) : row.activeVariantCount === row.variantCount ? (
                  formatNumber(row.variantCount)
                ) : (
                  <>
                    {formatNumber(row.activeVariantCount)}
                    <span className="text-muted-foreground"> of {formatNumber(row.variantCount)} on</span>
                  </>
                )}
              </Td>

              <Td label="Available to sell" align="end">
                <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  {formatNumber(row.available)}
                  <StatusBadge tone={stock.tone}>{stock.label}</StatusBadge>
                </span>
              </Td>

              <Td label="Updated" align="end" className="whitespace-nowrap">
                <time dateTime={row.updatedAt.toISOString()} title={formatAdminDateTime(row.updatedAt)}>
                  {formatRelative(row.updatedAt, now)}
                </time>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
