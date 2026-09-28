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
import { formatAdminDateTime, formatKobo, formatRelative } from "@/lib/admin/format";
import type { Loaded, RecentOrder } from "@/lib/admin/metrics";
import { orderStatusDisplay } from "@/lib/admin/status";

import { ORDERS_PATH, orderHref } from "./links";
import { SectionLink } from "./section-link";
import { SectionUnavailable } from "./section-unavailable";

/** The newest orders with their status in the owner's words; each row opens the order. */
export async function RecentOrdersSection({ orders, now }: { orders: Promise<Loaded<RecentOrder[]>>; now: Date }) {
  const result = await orders;

  return (
    <AdminSection
      title="Latest orders"
      description="Newest first. Checkouts that closed without payment are left out."
      actions={<SectionLink href={ORDERS_PATH}>All orders</SectionLink>}
      flush
    >
      {!result.ok ? (
        <SectionUnavailable reason={result.reason} what="The latest orders" />
      ) : result.data.length === 0 ? (
        <AdminEmptyState title="No orders yet" body="Orders show here as soon as customers check out." />
      ) : (
        <DataTable caption="Latest orders" frameClassName="border-0">
          <THead>
            <Tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th align="end">Total</Th>
              <Th>Status</Th>
              <Th align="end">Placed</Th>
            </Tr>
          </THead>
          <TBody>
            {result.data.map((order) => {
              const status = orderStatusDisplay(order, now);
              return (
                <Tr key={order.id} interactive>
                  <RowHeader>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <RowLink href={orderHref(order.number)} className="tabular-nums">
                        {order.number}
                      </RowLink>
                      {order.isDemo ? <StatusBadge>Demo</StatusBadge> : null}
                      {order.isTest ? <StatusBadge tone="info">Test</StatusBadge> : null}
                    </span>
                  </RowHeader>
                  <Td label="Customer">
                    <span className="block break-words">{order.customerName}</span>
                    {/* Only where the column has room for an address on one line. */}
                    <span className="hidden text-caption break-all text-muted-foreground xl:block">{order.email}</span>
                  </Td>
                  <Td label="Total" align="end" className="whitespace-nowrap">
                    {formatKobo(order.total)}
                  </Td>
                  <Td label="Status">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </Td>
                  <Td label="Placed" align="end" className="whitespace-nowrap">
                    <time dateTime={order.createdAt.toISOString()} title={formatAdminDateTime(order.createdAt)}>
                      {formatRelative(order.createdAt, now)}
                    </time>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </AdminSection>
  );
}
