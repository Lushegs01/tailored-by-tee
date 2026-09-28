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
import type { CustomerRow } from "@/lib/admin/customers";
import { formatAdminDate, formatAdminDateTime, formatKobo, formatNumber, formatRelative } from "@/lib/admin/format";
import { buildSortHref, sortDirectionFor, type ListParams } from "@/lib/admin/pagination";

import { accountDisplay, customerHref, CUSTOMERS_PATH, customerName } from "./customer-rules";

/*
 * The customers list. One row per email address: the account if there is one,
 * otherwise the guest checkouts made with it. Rows open the customer's page.
 * Below md each row becomes a labelled block, so the page never scrolls sideways
 * on a phone.
 */

export interface CustomersTableProps {
  rows: readonly CustomerRow[];
  params: ListParams;
  /** Rendered on the server; passed in so every row's "3 days ago" agrees. */
  now: Date;
}

export function CustomersTable({ rows, params, now }: CustomersTableProps) {
  const sort = (column: string, firstDir: "asc" | "desc" = "desc") => ({
    href: buildSortHref(CUSTOMERS_PATH, params, column, firstDir),
    direction: sortDirectionFor(params, column),
  });

  return (
    <DataTable caption="Customers">
      <THead>
        <Tr>
          <Th sort={sort("name", "asc")}>Customer</Th>
          <Th sort={sort("newest")}>Account</Th>
          <Th align="end" sort={sort("orders")}>
            Orders
          </Th>
          <Th align="end" sort={sort("spent")}>
            Total spent
          </Th>
          <Th sort={sort("lastOrder")}>Last order</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <CustomerTableRow key={row.email} row={row} now={now} />
        ))}
      </TBody>
    </DataTable>
  );
}

function CustomerTableRow({ row, now }: { row: CustomerRow; now: Date }) {
  const account = accountDisplay(row.userId !== null);
  const name = customerName(row);
  const showsEmail = name !== row.email;

  return (
    <Tr interactive>
      <RowHeader>
        <RowLink href={customerHref(row)}>{name}</RowLink>
        {showsEmail ? <span className="mt-0.5 block font-normal break-all text-caption text-muted-foreground">{row.email}</span> : null}
        {row.isAdmin || row.isDemo ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.isAdmin ? <StatusBadge tone="info">Administrator</StatusBadge> : null}
            {row.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
          </span>
        ) : null}
      </RowHeader>

      <Td label="Account">
        <StatusBadge tone={account.tone}>{account.label}</StatusBadge>
        {row.registeredAt ? (
          <span className="mt-1 block text-caption text-muted-foreground">
            Since {formatAdminDate(row.registeredAt)}
          </span>
        ) : null}
      </Td>

      <Td label="Orders" align="end">
        {formatNumber(row.paidOrders)}
        {row.ordersTotal > row.paidOrders ? (
          <span className="mt-0.5 block text-caption text-muted-foreground">
            {formatNumber(row.ordersTotal)} placed
          </span>
        ) : null}
      </Td>

      <Td label="Total spent" align="end">
        {formatKobo(row.spent)}
        {row.testSpent > 0 ? (
          <span className="mt-0.5 block text-caption text-muted-foreground">
            {formatKobo(row.testSpent)} in test payments
          </span>
        ) : null}
      </Td>

      <Td label="Last order">
        {row.lastOrderAt ? (
          <time dateTime={row.lastOrderAt} title={formatAdminDateTime(row.lastOrderAt)}>
            {formatRelative(row.lastOrderAt, now)}
          </time>
        ) : (
          <span className="text-muted-foreground">Never ordered</span>
        )}
      </Td>
    </Tr>
  );
}
