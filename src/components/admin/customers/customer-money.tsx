import { Stat, StatGrid } from "@/components/admin/ui";
import type { CustomerTotals } from "@/lib/admin/customers";
import { formatAdminDate, formatAdminDateTime, formatKobo, formatNumber, formatRelative } from "@/lib/admin/format";

import { CustomerNote } from "./customer-notices";
import { customerOrdersHref, SPEND_NOTE, TEST_MONEY_NOTE } from "./customer-rules";

/*
 * One customer's figures, the same four on the account page and the guest view:
 * how many orders they have paid for, what they have spent, the average, and
 * when they last bought something. Test payments are never added to real money —
 * they are named underneath instead.
 */

export function CustomerFigures({
  totals,
  email,
  now,
  className,
}: {
  totals: CustomerTotals;
  email: string;
  now: Date;
  className?: string;
}) {
  const average = totals.paidOrders > 0 ? Math.round(totals.spent / totals.paidOrders) : null;

  return (
    <StatGrid className={className}>
      <Stat
        label="Paid orders"
        value={formatNumber(totals.paidOrders)}
        hint={
          totals.ordersTotal > totals.paidOrders
            ? `${formatNumber(totals.ordersTotal)} placed in all`
            : "Paid and going ahead"
        }
        href={totals.ordersTotal > 0 ? customerOrdersHref(email) : undefined}
      />
      <Stat
        label="Total spent"
        value={formatKobo(totals.spent)}
        hint={totals.refunded > 0 ? `After ${formatKobo(totals.refunded)} refunded` : "After any refunds"}
      />
      <Stat label="Average order" value={average === null ? "—" : formatKobo(average)} hint="Across paid orders" />
      <Stat
        label="Last order"
        value={
          totals.lastOrderAt ? (
            <time dateTime={totals.lastOrderAt} title={formatAdminDateTime(totals.lastOrderAt)}>
              {formatRelative(totals.lastOrderAt, now)}
            </time>
          ) : (
            "—"
          )
        }
        hint={totals.firstOrderAt ? `First ordered ${formatAdminDate(totals.firstOrderAt)}` : "Nothing ordered yet"}
      />
    </StatGrid>
  );
}

/** What the figures above count, said plainly — and the test payments kept out of them. */
export function CustomerFiguresNote({ totals, className }: { totals: CustomerTotals; className?: string }) {
  return (
    <CustomerNote className={className}>
      {SPEND_NOTE}
      {totals.testOrders > 0 ? (
        <>
          {" "}
          {TEST_MONEY_NOTE} This customer has {formatNumber(totals.testOrders)} test{" "}
          {totals.testOrders === 1 ? "payment" : "payments"} worth {formatKobo(totals.testSpent)}.
        </>
      ) : null}
    </CustomerNote>
  );
}
