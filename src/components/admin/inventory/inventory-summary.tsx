import { Stat, StatGrid } from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import type { InventorySummary as Summary } from "@/lib/admin/inventory";
import { buildListHref, type ListParams } from "@/lib/admin/pagination";
import { INVENTORY_PATH, pieces } from "@/lib/admin/stock-state";

/**
 * The headline figures for the current search and filters (whatever the stock
 * filter): pieces available and held, and how many variants are low or sold out
 * — each of those a link to the rows behind it.
 */
export function InventorySummary({
  summary,
  params,
  className,
}: {
  summary: Summary;
  params: ListParams;
  className?: string;
}) {
  const stateHref = (state: string) => buildListHref(INVENTORY_PATH, params, { filters: { state } });
  const variants = (count: number) => `${formatNumber(count)} ${count === 1 ? "variant" : "variants"}`;

  return (
    <StatGrid className={className}>
      <Stat
        label="Available to sell"
        value={formatNumber(summary.piecesAvailable)}
        hint={`Pieces, from ${pieces(summary.piecesOnHand)} on hand`}
      />
      <Stat
        label="Held for unpaid orders"
        value={formatNumber(summary.piecesHeld)}
        hint="Pieces in checkouts waiting for payment; released if not paid in time"
      />
      <Stat
        label="Low stock"
        value={variants(summary.lowStock)}
        hint="At or below their low-stock level"
        href={summary.lowStock > 0 ? stateHref("low_stock") : undefined}
      />
      <Stat
        label="Sold out"
        value={variants(summary.outOfStock)}
        hint="Nothing left to sell"
        href={summary.outOfStock > 0 ? stateHref("out_of_stock") : undefined}
      />
    </StatGrid>
  );
}
