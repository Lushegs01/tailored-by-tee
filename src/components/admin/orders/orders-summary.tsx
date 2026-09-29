import { Stat, StatGrid } from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import { buildListHref, type ListParams } from "@/lib/admin/pagination";
import type { OrderListSummary } from "@/lib/admin/orders";

import { ORDERS_LIST_PATH } from "./order-copy";

/*
 * The four figures above the list, each a shortcut into it. They count every
 * order — test and demo included — so they agree with the navigation badge and
 * the overview page.
 */

export function OrdersSummary({
  summary,
  params,
  className,
}: {
  summary: OrderListSummary;
  params: ListParams;
  className?: string;
}) {
  const href = (status: string) => buildListHref(ORDERS_LIST_PATH, params, { filters: { status } });

  return (
    <StatGrid className={className}>
      <Stat
        label="To prepare"
        value={formatNumber(summary.toPrepare)}
        hint="Paid and waiting to be packed"
        href={summary.toPrepare > 0 ? href("PAID") : undefined}
      />
      <Stat
        label="Ready to ship"
        value={formatNumber(summary.readyToShip)}
        hint="Packed, waiting to go out"
        href={summary.readyToShip > 0 ? href("PROCESSING") : undefined}
      />
      <Stat
        label="Awaiting payment"
        value={formatNumber(summary.awaitingPayment)}
        hint="Checkouts that haven’t been paid"
        href={summary.awaitingPayment > 0 ? href("PENDING") : undefined}
      />
      <Stat
        label="Refunds due"
        value={formatNumber(summary.refundDue)}
        hint={summary.refundDue > 0 ? "Cancelled, but the customer paid" : "Nothing owed back"}
        href={summary.refundDue > 0 ? href("CANCELLED") : undefined}
      />
    </StatGrid>
  );
}
