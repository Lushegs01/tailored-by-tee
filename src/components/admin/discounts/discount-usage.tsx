import {
  AdminEmptyState,
  AdminSection,
  DataTable,
  Pagination,
  RowHeader,
  RowLink,
  Stat,
  StatGrid,
  StatusBadge,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { describeUses, discountPath } from "@/lib/admin/discount-schema";
import { getDiscountUsageSummary, listDiscountOrders } from "@/lib/admin/discounts";
import { formatAdminDateTime, formatKobo, formatNumber, formatRelative } from "@/lib/admin/format";
import type { ListParams } from "@/lib/admin/pagination";
import { orderStatusDisplay } from "@/lib/admin/status";

/*
 * How a code has been used: headline figures, and the orders placed with it
 * (newest first, paged). Both stream in after the form, each behind its own
 * placeholder.
 */

const orderPath = (number: string) => `/admin/orders/${encodeURIComponent(number)}`;

/** Uses, paid orders, discount given and sales for one code. */
export async function DiscountUsageStats({
  couponId,
  usageCount,
  usageLimit,
}: {
  couponId: string;
  usageCount: number;
  usageLimit: number | null;
}) {
  const summary = await getDiscountUsageSummary(couponId);

  return (
    <StatGrid>
      <Stat
        label="Uses"
        value={describeUses(usageCount, usageLimit)}
        hint={
          summary.awaitingPayment > 0
            ? `Including ${formatNumber(summary.awaitingPayment)} awaiting payment`
            : usageLimit === null
              ? "No limit"
              : `${formatNumber(Math.max(0, usageLimit - usageCount))} left`
        }
      />
      <Stat
        label="Paid orders"
        value={formatNumber(summary.paidOrders)}
        hint={summary.testOrders > 0 ? `Plus ${formatNumber(summary.testOrders)} test payment${summary.testOrders === 1 ? "" : "s"}` : "Paid and not cancelled"}
      />
      <Stat label="Discount given" value={formatKobo(summary.discountGiven)} hint="On paid orders" />
      <Stat
        label="Sales with this code"
        value={formatKobo(summary.paidSales)}
        hint="Paid order totals: after the discount, with delivery"
      />
    </StatGrid>
  );
}

export function DiscountUsageStatsSkeleton() {
  return (
    <div role="status" className="grid grid-cols-1 gap-px border bg-border min-[380px]:grid-cols-2 lg:grid-cols-4">
      <span className="sr-only">Loading figures</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} aria-hidden="true" className="bg-background-raised p-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-2.5 w-28" />
        </div>
      ))}
    </div>
  );
}

const SECTION_TITLE = "Orders with this code";
const SECTION_NOTE =
  "Checkouts awaiting payment count as uses; if the payment window closes, the order is cancelled and its use given back.";

/** The orders placed with a code, one page at a time (?page= on the code's page). */
export async function DiscountOrdersSection({
  couponId,
  code,
  params,
}: {
  couponId: string;
  code: string;
  params: ListParams;
}) {
  const { rows, total, page } = await listDiscountOrders(couponId, params.page);
  const now = new Date();

  return (
    <AdminSection title={SECTION_TITLE} description={SECTION_NOTE} flush id="orders">
      {rows.length === 0 ? (
        <AdminEmptyState
          title="No orders yet"
          body={`When a customer places an order with ${code}, it will appear here.`}
        />
      ) : (
        <>
          <DataTable caption={`Orders placed with ${code}`} frameClassName="border-0">
            <THead>
              <Tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th align="end">Discount</Th>
                <Th align="end">Order total</Th>
                <Th>Status</Th>
                <Th>Placed</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((order) => {
                const status = orderStatusDisplay(order, now);
                return (
                  <Tr key={order.id} interactive>
                    <RowHeader className="whitespace-nowrap">
                      <RowLink href={orderPath(order.number)} className="tabular-nums">
                        {order.number}
                      </RowLink>
                      {order.isTest ? (
                        <StatusBadge tone="info" className="ml-2 align-middle">
                          Test
                        </StatusBadge>
                      ) : null}
                    </RowHeader>
                    <Td label="Customer" className="min-w-0">
                      <span className="block max-md:text-right">
                        <span className="block break-words">{order.customerName}</span>
                        <span className="block text-caption break-all text-muted-foreground">{order.email}</span>
                      </span>
                    </Td>
                    <Td label="Discount" align="end">
                      {order.discountTotal > 0 ? `−${formatKobo(order.discountTotal)}` : formatKobo(0)}
                    </Td>
                    <Td label="Order total" align="end">
                      {formatKobo(order.total)}
                    </Td>
                    <Td label="Status">
                      <span title={status.description}>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </span>
                    </Td>
                    <Td label="Placed" className="whitespace-nowrap">
                      <time dateTime={order.createdAt.toISOString()} title={formatAdminDateTime(order.createdAt)}>
                        {formatRelative(order.createdAt, now)}
                      </time>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <div className="border-t px-4 md:px-5">
            <Pagination
              base={`${discountPath(couponId)}`}
              params={{ ...params, page }}
              total={total}
              noun={{ one: "order", other: "orders" }}
            />
          </div>
        </>
      )}
    </AdminSection>
  );
}

export function DiscountOrdersSkeleton() {
  return (
    <section className="border bg-background-raised" aria-label={SECTION_TITLE}>
      <div className="border-b px-4 py-3 md:px-5">
        <h2 className="py-1 text-label">{SECTION_TITLE}</h2>
      </div>
      <div role="status">
        <span className="sr-only">Loading orders</span>
        <ul aria-hidden="true" className="divide-y">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex items-center gap-6 px-4 py-3.5 md:px-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="hidden h-3 w-20 md:block" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
