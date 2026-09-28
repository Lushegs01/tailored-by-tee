import Link from "next/link";

import {
  AdminEmptyState,
  AdminSection,
  DataTable,
  RowHeader,
  RowLink,
  StatusBadge,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import type { Loaded, StockWatch } from "@/lib/admin/metrics";
import { stockDisplay } from "@/lib/admin/status";
import { cn } from "@/lib/utils";

import { INVENTORY_PATH, inventorySkuHref, inventoryStateHref } from "./links";
import { SectionLink } from "./section-link";
import { SectionUnavailable } from "./section-unavailable";

/**
 * Sold-out and low-stock pieces among live products (by the storefront's own
 * rule: available = in stock minus pieces held for unpaid checkouts), with the
 * lowest few listed. Each count opens the inventory list filtered to it; each
 * piece opens the inventory list at its SKU, where stock is adjusted.
 */
export async function StockWatchSection({ stock }: { stock: Promise<Loaded<StockWatch>> }) {
  const result = await stock;

  return (
    <AdminSection
      title="Stock to watch"
      description="Live products only. Available means in stock and not held for an unpaid checkout."
      actions={<SectionLink href={INVENTORY_PATH}>Inventory</SectionLink>}
      flush
    >
      {!result.ok ? (
        <SectionUnavailable reason={result.reason} what="Stock figures" />
      ) : result.data.liveVariants === 0 ? (
        <AdminEmptyState
          title="No live products yet"
          body="Once products are live, anything sold out or running low shows here."
        />
      ) : (
        <StockWatchBody watch={result.data} />
      )}
    </AdminSection>
  );
}

function StockWatchBody({ watch }: { watch: StockWatch }) {
  return (
    <>
      <dl className="grid grid-cols-2 divide-x border-b">
        <StockCount
          label="Sold out"
          count={watch.outOfStock}
          hint="Nothing left to sell"
          href={inventoryStateHref("out_of_stock")}
          critical={watch.outOfStock > 0}
        />
        <StockCount
          label="Low stock"
          count={watch.lowStock}
          hint="At or below the low-stock level"
          href={inventoryStateHref("low_stock")}
        />
      </dl>

      {watch.lowest.length === 0 ? (
        <AdminEmptyState
          title="Nothing is running low"
          body="Every live product has more than its low-stock level available, in every colour and size."
        />
      ) : (
        <DataTable caption="Items with the least stock available" frameClassName="border-0">
          <THead>
            <Tr>
              <Th>Item</Th>
              <Th>SKU</Th>
              <Th align="end">Available</Th>
            </Tr>
          </THead>
          <TBody>
            {watch.lowest.map((item) => {
              const display = stockDisplay(item);
              return (
                <Tr key={item.variantId} interactive>
                  <RowHeader>
                    <RowLink href={inventorySkuHref(item.sku)}>
                      {item.productName}
                      <span className="sr-only">
                        , {item.colorName}, {item.sizeLabel}
                      </span>
                    </RowLink>
                    <span aria-hidden="true" className="mt-0.5 block text-caption font-normal text-muted-foreground">
                      {item.colorName} · {item.sizeLabel}
                    </span>
                  </RowHeader>
                  <Td label="SKU">
                    <span className="text-caption break-all text-muted-foreground tabular-nums">{item.sku}</span>
                  </Td>
                  <Td label="Available" align="end">
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      <span title={`${formatNumber(item.onHand)} in stock, ${formatNumber(item.reserved)} held`}>
                        {formatNumber(item.available)}
                      </span>
                      <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </>
  );
}

/** One linked count; the link covers the cell. */
function StockCount({
  label,
  count,
  hint,
  href,
  critical = false,
}: {
  label: string;
  count: number;
  hint: string;
  href: string;
  critical?: boolean;
}) {
  return (
    <div className="relative flex min-w-0 flex-col p-4 transition-colors hover:bg-surface/60 md:px-5">
      <dt className="text-eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        <Link
          href={href}
          className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-[1.5px] focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
        >
          <span className={cn("block text-2xl font-medium tracking-tight tabular-nums", critical && "text-danger")}>
            {formatNumber(count)}
          </span>
          <span className="sr-only"> {label.toLowerCase()}: show them in the inventory</span>
        </Link>
      </dd>
      <dd className="mt-1 text-caption text-muted-foreground">{hint}</dd>
    </div>
  );
}
