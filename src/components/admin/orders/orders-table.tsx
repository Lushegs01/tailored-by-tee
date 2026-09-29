import {
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
import { formatAdminDateTime, formatKobo, formatNumber } from "@/lib/admin/format";
import { orderPath } from "@/lib/admin/order-transitions";
import type { AdminOrderRow } from "@/lib/admin/orders";
import { buildSortHref, sortDirectionFor, type ListParams } from "@/lib/admin/pagination";
import { orderStatusDisplay, paymentStatusDisplay } from "@/lib/admin/status";
import { pluralize } from "@/lib/format";

import { ORDERS_LIST_PATH, deliveryZoneName } from "./order-copy";

/*
 * The orders list. Each row links to the order; below md the row becomes a card
 * with its column headings beside the values, so the page never scrolls sideways
 * on a phone.
 */

export function OrdersTable({ rows, params, now }: { rows: AdminOrderRow[]; params: ListParams; now: Date }) {
  const sort = (column: string, firstDir: "asc" | "desc" = "desc") => ({
    href: buildSortHref(ORDERS_LIST_PATH, params, column, firstDir),
    direction: sortDirectionFor(params, column),
  });

  return (
    <DataTable caption="Orders">
      <THead>
        <Tr>
          <Th>Order</Th>
          <Th sort={sort("placed")}>Placed</Th>
          <Th>Customer</Th>
          <Th align="end">Pieces</Th>
          <Th sort={sort("total")} align="end">
            Total
          </Th>
          <Th>Payment</Th>
          <Th>Status</Th>
          <Th>Delivery</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const status = orderStatusDisplay(row, now);
          const payment = paymentStatusDisplay(row.paymentStatus, row.isTest);
          const collection = row.deliveryMethod === "PICKUP";

          return (
            <Tr key={row.id} interactive>
              <RowHeader>
                <RowLink href={orderPath(row.number)}>
                  <span className="tabular-nums">{row.number}</span>
                </RowLink>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {row.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
                  {row.isTest ? <StatusBadge tone="info">Test</StatusBadge> : null}
                </span>
              </RowHeader>

              <Td label="Placed">
                <time dateTime={row.createdAt.toISOString()} className="tabular-nums">
                  {formatAdminDateTime(row.createdAt)}
                </time>
              </Td>

              <Td label="Customer">
                <span className="block break-words">{row.customerName}</span>
                <span className="block break-all text-caption text-muted-foreground">{row.email}</span>
              </Td>

              <Td label="Pieces" align="end">
                <span title={pluralize(row.lines, "line")}>{formatNumber(row.pieces)}</span>
              </Td>

              <Td label="Total" align="end">
                {formatKobo(row.total)}
              </Td>

              <Td label="Payment">
                <StatusBadge tone={payment.tone}>{payment.label}</StatusBadge>
              </Td>

              <Td label="Status">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </Td>

              <Td label="Delivery">
                <span className="block">{collection ? "Collection" : "Delivery"}</span>
                {!collection && deliveryZoneName(row.deliveryZone) ? (
                  <span className="block text-caption text-muted-foreground">
                    {deliveryZoneName(row.deliveryZone)}
                  </span>
                ) : null}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
