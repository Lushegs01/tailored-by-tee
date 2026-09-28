"use client";

import { ColorSwatch } from "@/components/admin/inventory/color-swatch";
import { DataTable, RowHeader, StatusBadge, TBody, THead, Td, Th, Tr } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { formatKobo, formatNumber } from "@/lib/admin/format";
import { stockDisplay } from "@/lib/admin/status";

import { VariantRowActions } from "./variant-row-actions";
import {
  availableOf,
  comboKey,
  variantCount,
  variantOptionLabel,
  type MatrixCell,
  type MatrixGroup,
  type VariantView,
} from "./variant-rules";

/*
 * The colour × size matrix, one row per combination and one group per colour:
 * whether the variant exists, its SKU, what's available to sell, on hand and
 * held, its low-stock level, its own price if it has one, and its actions.
 *
 * Phones (below md): each row becomes a card under its colour's heading — the
 * matrix read as a list, which is how it fits in a hand. From md it is a table;
 * the SKU and low-stock level get their own columns from xl, where there is
 * room. A narrow tablet scrolls the table inside its own frame, never the page.
 */

const COLUMNS = 9;

export interface VariantMatrixProps {
  productId: string;
  productName: string;
  productPrice: number;
  groups: readonly MatrixGroup[];
  announce: (message: string) => void;
  /** Opens the create dialog with one combination ticked. */
  onCreateOne: (cell: MatrixCell) => void;
}

export function VariantMatrix({
  productId,
  productName,
  productPrice,
  groups,
  announce,
  onCreateOne,
}: VariantMatrixProps) {
  return (
    <DataTable
      caption="Variants by colour and size"
      frameClassName="md:overflow-x-auto"
      className="md:min-w-[56rem]"
    >
      <MatrixHead />
      {groups.map((group) => (
        <TBody key={group.color.id}>
          <Tr className="bg-surface/50 max-md:group-data-[layout=stack]/table:block max-md:group-data-[layout=stack]/table:p-0">
            <th
              scope="rowgroup"
              colSpan={COLUMNS}
              className="px-4 py-2.5 text-left text-label font-medium max-md:group-data-[layout=stack]/table:block"
            >
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ColorSwatch hex={group.color.hex} className="size-4" />
                <span>{group.color.name}</span>
                <span className="text-caption font-normal text-muted-foreground tabular-nums">
                  {group.created === group.cells.length
                    ? `all ${variantCount(group.cells.length)} created`
                    : `${formatNumber(group.created)} of ${formatNumber(group.cells.length)} created`}
                </span>
              </span>
            </th>
          </Tr>
          {group.cells.map((cell) =>
            cell.variant ? (
              <VariantRow
                key={cell.variant.id}
                productId={productId}
                productName={productName}
                productPrice={productPrice}
                variant={cell.variant}
                announce={announce}
              />
            ) : (
              <MissingRow key={comboKey(cell.color.id, cell.size.id)} cell={cell} onCreate={() => onCreateOne(cell)} />
            ),
          )}
        </TBody>
      ))}
    </DataTable>
  );
}

/** The same table for variants whose colour or size is no longer on the product. */
export function OrphanVariantsTable({
  productId,
  productName,
  productPrice,
  variants,
  announce,
}: {
  productId: string;
  productName: string;
  productPrice: number;
  variants: readonly VariantView[];
  announce: (message: string) => void;
}) {
  return (
    <DataTable
      caption="Variants of colours and sizes no longer offered"
      frameClassName="md:overflow-x-auto"
      className="md:min-w-[56rem]"
    >
      <MatrixHead colourColumn />
      <TBody>
        {variants.map((variant) => (
          <VariantRow
            key={variant.id}
            productId={productId}
            productName={productName}
            productPrice={productPrice}
            variant={variant}
            announce={announce}
            showColour
          />
        ))}
      </TBody>
    </DataTable>
  );
}

function MatrixHead({ colourColumn = false }: { colourColumn?: boolean }) {
  return (
    <THead>
      <Tr>
        <Th>{colourColumn ? "Colour and size" : "Size"}</Th>
        <Th className="max-xl:hidden">SKU</Th>
        <Th align="end">
          Available<span className="sr-only"> to sell</span>
        </Th>
        <Th align="end">On hand</Th>
        <Th align="end">
          Held<span className="sr-only"> for unpaid orders</span>
        </Th>
        <Th align="end" className="max-xl:hidden">
          Low at<span className="sr-only">: low-stock level</span>
        </Th>
        <Th>Price</Th>
        <Th>Stock</Th>
        <Th align="end">
          <span className="sr-only">Actions</span>
        </Th>
      </Tr>
    </THead>
  );
}

function VariantRow({
  productId,
  productName,
  productPrice,
  variant,
  announce,
  showColour = false,
}: {
  productId: string;
  productName: string;
  productPrice: number;
  variant: VariantView;
  announce: (message: string) => void;
  showColour?: boolean;
}) {
  const stock = stockDisplay(variant);
  const available = availableOf(variant);
  const label = showColour ? variantOptionLabel(variant.colorName, variant.sizeLabel) : variant.sizeLabel;

  return (
    <Tr highlight={variant.isActive && available === 0}>
      <RowHeader className="font-normal md:max-w-[14rem]">
        <span className="font-medium">{label}</span>
        {showColour ? null : <span className="sr-only">, {variant.colorName}</span>}
        <span className="mt-0.5 block text-caption break-all text-muted-foreground xl:hidden">
          <span className="sr-only">SKU </span>
          {variant.sku}
        </span>
      </RowHeader>
      <Td label="SKU" className="text-caption break-all text-muted-foreground max-xl:hidden">
        {variant.sku}
      </Td>
      <Td label="Available to sell" align="end">
        {formatNumber(available)}
      </Td>
      <Td label="On hand" align="end">
        {formatNumber(variant.onHand)}
      </Td>
      <Td label="Held for unpaid orders" align="end" className={variant.reserved > 0 ? undefined : "text-muted-foreground"}>
        {formatNumber(variant.reserved)}
      </Td>
      <Td label="Low-stock level" align="end" className="max-xl:hidden">
        {formatNumber(variant.lowStockThreshold)}
      </Td>
      <Td label="Price">
        {variant.priceOverride === null ? (
          <span className="text-muted-foreground">Product price</span>
        ) : (
          <span className="tabular-nums">{formatKobo(variant.priceOverride)}</span>
        )}
      </Td>
      <Td label="Stock">
        <span className="flex flex-wrap items-center gap-1.5">
          {variant.isActive ? (
            <StatusBadge tone={stock.tone}>{stock.label}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Switched off</StatusBadge>
          )}
        </span>
      </Td>
      <Td align="end" className="max-md:group-data-[layout=stack]/table:pt-2">
        <VariantRowActions
          productId={productId}
          productName={productName}
          productPrice={productPrice}
          variant={variant}
          announce={announce}
        />
      </Td>
    </Tr>
  );
}

function MissingRow({ cell, onCreate }: { cell: MatrixCell; onCreate: () => void }) {
  return (
    <Tr>
      <RowHeader className="font-normal md:max-w-[14rem]">
        <span className="font-medium text-muted-foreground">{cell.size.label}</span>
        <span className="sr-only">, {cell.color.name}</span>
        <span className="mt-0.5 block text-caption break-all text-muted-foreground xl:hidden">
          {cell.sku ?? "No SKU yet"}
        </span>
      </RowHeader>
      <Td label="SKU" className="text-caption break-all text-muted-foreground max-xl:hidden">
        {cell.sku ?? "—"}
      </Td>
      <Td label="Available to sell" align="end" className="text-muted-foreground">
        —
      </Td>
      <Td label="On hand" align="end" className="text-muted-foreground">
        —
      </Td>
      <Td label="Held for unpaid orders" align="end" className="text-muted-foreground">
        —
      </Td>
      <Td label="Low-stock level" align="end" className="text-muted-foreground max-xl:hidden">
        —
      </Td>
      <Td label="Price" className="text-muted-foreground">
        —
      </Td>
      <Td label="Stock">
        <StatusBadge tone="neutral">Not created</StatusBadge>
      </Td>
      <Td align="end" className="max-md:group-data-[layout=stack]/table:pt-2">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="h-9 px-3" disabled={cell.sku === null} onClick={onCreate}>
            Create<span className="sr-only">
              {" "}
              the variant for {cell.color.name}, {cell.size.label}
            </span>
          </Button>
        </div>
      </Td>
    </Tr>
  );
}
