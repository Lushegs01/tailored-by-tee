import Link from "next/link";

import {
  AdminEmptyState,
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
import type { CustomerOrderRow } from "@/lib/admin/customers";
import { formatAdminDate, formatAdminDateTime, formatKobo, formatNumber } from "@/lib/admin/format";
import { orderStatusDisplay } from "@/lib/admin/status";

import { customerOrdersHref, orderHref } from "./customer-rules";

/*
 * A customer's orders, newest first, on both the account page and the guest view.
 * Every row opens the order itself; the status wording is the one the orders
 * pages use, so nothing has to be translated in the owner's head.
 */

export interface CustomerOrdersTableProps {
  orders: readonly CustomerOrderRow[];
  /** The address this page is about, so an order placed with another one is flagged. */
  email: string;
  now: Date;
}

export function CustomerOrdersTable({ orders, email, now }: CustomerOrdersTableProps) {
  return (
    <DataTable caption="Orders" frameClassName="border-0">
      <THead>
        <Tr>
          <Th>Order</Th>
          <Th>Placed</Th>
          <Th align="end">Pieces</Th>
          <Th align="end">Total</Th>
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        {orders.map((order) => {
          const status = orderStatusDisplay(order, now);
          const otherAddress = order.email.toLowerCase() !== email.toLowerCase();
          return (
            <Tr key={order.id} interactive>
              <RowHeader>
                <RowLink href={orderHref(order.number)} className="font-mono">
                  {order.number}
                </RowLink>
                {order.isDemo || order.isTest || otherAddress ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {order.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
                    {order.isTest ? <StatusBadge tone="neutral">Test payment</StatusBadge> : null}
                    {otherAddress ? <StatusBadge tone="neutral">Another address</StatusBadge> : null}
                  </span>
                ) : null}
                {otherAddress ? (
                  <span className="mt-1 block font-normal break-all text-caption text-muted-foreground">
                    Placed with {order.email}
                  </span>
                ) : null}
              </RowHeader>

              <Td label="Placed">
                <time dateTime={order.placedAt} title={formatAdminDateTime(order.placedAt)}>
                  {formatAdminDate(order.placedAt)}
                </time>
              </Td>

              <Td label="Pieces" align="end">
                {formatNumber(order.itemCount)}
              </Td>

              <Td label="Total" align="end">
                {formatKobo(order.total)}
                {order.refunded > 0 ? (
                  <span className="mt-0.5 block text-caption text-muted-foreground">
                    {formatKobo(order.refunded)} refunded
                  </span>
                ) : null}
              </Td>

              <Td label="Status">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}

/** Nothing has ever been ordered with this address. */
export function NoCustomerOrders({ registered }: { registered: boolean }) {
  return (
    <AdminEmptyState
      title="No orders yet"
      body={
        registered
          ? "They have an account but haven’t bought anything yet. Orders placed with this email address will appear here, whether or not they sign in first."
          : "Nothing has been ordered with this address."
      }
    />
  );
}

/** Older orders are only in the orders list; this is the way there. */
export function MoreOrdersLink({ email, shown, total }: { email: string; shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="text-body-sm">
      Showing the {formatNumber(shown)} most recent of {formatNumber(total)} orders.{" "}
      <Link href={customerOrdersHref(email)} className="whitespace-nowrap">
        <span className="link-underline-static pb-0.5">See them all in Orders</span>
      </Link>
    </p>
  );
}
