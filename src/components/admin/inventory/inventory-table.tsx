import Link from "next/link";

import { DataTable, RowHeader, StatusBadge, TBody, THead, Td, Th, Tr } from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import type { InventoryRow } from "@/lib/admin/inventory";
import { buildSortHref, sortDirectionFor, type ListParams } from "@/lib/admin/pagination";
import { productStatusDisplay, stockDisplay } from "@/lib/admin/status";
import { INVENTORY_PATH, type StockActionTarget } from "@/lib/admin/stock-state";

import { ColorSwatch } from "./color-swatch";
import { StockRowActions } from "./stock-row-actions";

/*
 * The stock table: one row per colour and size.
 *
 * Phones (below md): each row becomes a card — the product, its colour, size
 * and SKU, the three figures that matter (on hand, held, available), the stock
 * state and the actions. From md it's a table; the SKU and low-stock level get
 * their own columns from xl, where there's room (below that the SKU sits under
 * the product name). A narrow tablet scrolls the table inside its own frame
 * rather than the page.
 */

function actionTarget(row: InventoryRow): StockActionTarget {
  return {
    variantId: row.variantId,
    sku: row.sku,
    productName: row.productName,
    colorName: row.colorName,
    sizeLabel: row.sizeLabel,
    isActive: row.isActive,
    onHand: row.onHand,
    reserved: row.reserved,
    lowStockThreshold: row.lowStockThreshold,
    awaitingShipment: row.awaitingShipment,
  };
}

export function InventoryTable({ rows, params }: { rows: readonly InventoryRow[]; params: ListParams }) {
  const sort = (column: string) => ({
    href: buildSortHref(INVENTORY_PATH, params, column, "asc"),
    direction: sortDirectionFor(params, column),
  });

  return (
    <DataTable
      caption="Stock by colour and size"
      frameClassName="md:overflow-x-auto"
      className="md:min-w-[42rem]"
    >
      <THead>
        <Tr>
          <Th sort={sort("product")}>Product</Th>
          <Th sort={sort("sku")} className="max-xl:hidden">
            SKU
          </Th>
          <Th align="end">On hand</Th>
          <Th align="end">
            Held<span className="sr-only"> for unpaid orders</span>
          </Th>
          <Th align="end" sort={sort("available")}>
            Available<span className="sr-only"> to sell</span>
          </Th>
          <Th align="end" className="max-xl:hidden">
            Low at<span className="sr-only">: low-stock level</span>
          </Th>
          <Th>Stock</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const stock = stockDisplay(row);
          const liveAndOut = row.state === "out_of_stock" && row.productStatus === "ACTIVE" && row.isActive;
          return (
            <Tr key={row.variantId} highlight={liveAndOut}>
              <RowHeader className="font-normal md:max-w-[18rem]">
                <Link
                  href={`/admin/products/${encodeURIComponent(row.productId)}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {row.productName}
                </Link>
                <span className="mt-1 flex items-center gap-2 text-caption text-muted-foreground">
                  <ColorSwatch hex={row.colorHex} />
                  <span>
                    {row.colorName}
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, size </span>
                    {row.sizeLabel}
                  </span>
                </span>
                <span className="mt-0.5 block text-caption break-all text-muted-foreground xl:hidden">
                  <span className="sr-only">SKU </span>
                  {row.sku}
                </span>
                {row.productStatus !== "ACTIVE" || !row.isActive ? (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {row.productStatus !== "ACTIVE" ? (
                      <StatusBadge tone="neutral">
                        <span className="sr-only">Product: </span>
                        {productStatusDisplay(row.productStatus).label}
                      </StatusBadge>
                    ) : null}
                    {!row.isActive ? <StatusBadge tone="neutral">Switched off</StatusBadge> : null}
                  </span>
                ) : null}
              </RowHeader>
              <Td label="SKU" className="text-caption break-all text-muted-foreground max-xl:hidden">
                {row.sku}
              </Td>
              <Td label="On hand" align="end">
                {formatNumber(row.onHand)}
              </Td>
              <Td
                label="Held for unpaid orders"
                align="end"
                className={row.reserved > 0 ? undefined : "text-muted-foreground"}
              >
                {formatNumber(row.reserved)}
              </Td>
              <Td label="Available to sell" align="end" className="font-medium">
                {formatNumber(row.available)}
              </Td>
              <Td label="Low-stock level" align="end" className="text-muted-foreground max-xl:hidden">
                {row.lowStockThreshold === 0 ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Off</span>
                  </>
                ) : (
                  formatNumber(row.lowStockThreshold)
                )}
              </Td>
              <Td label="Stock">
                <StatusBadge tone={stock.tone}>{stock.label}</StatusBadge>
              </Td>
              <Td className="md:w-px md:py-2 md:whitespace-nowrap">
                <StockRowActions target={actionTarget(row)} />
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
