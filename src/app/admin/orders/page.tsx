import Link from "next/link";

import {
  METHOD_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  RANGE_FILTER_OPTIONS,
  SHOW_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  hasOrderFilters,
  parseOrderListParams,
  toOrderListQuery,
} from "@/components/admin/orders/order-list-params";
import {
  NO_MATCHES_BODY,
  NO_MATCHES_TITLE,
  NO_ORDERS_BODY,
  NO_ORDERS_TITLE,
  ORDERS_DESCRIPTION,
} from "@/components/admin/orders/order-copy";
import { OrdersUnavailable } from "@/components/admin/orders/order-notices";
import { OrdersSummary } from "@/components/admin/orders/orders-summary";
import { OrdersTable } from "@/components/admin/orders/orders-table";
import {
  AdminEmptyState,
  AdminPageHeader,
  ListToolbar,
  Pagination,
  type ListToolbarFilter,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { ORDERS_EXPORT_PATH, ORDERS_PATH } from "@/lib/admin/order-transitions";
import { loadOrderList, ORDERS_EXPORT_LIMIT } from "@/lib/admin/orders";
import { buildListHref } from "@/lib/admin/pagination";

export const metadata = adminMetadata("Orders");

/**
 * /admin/orders: every order, newest first. Search by order number, name, email
 * or phone; filter by status (with a "to fulfil" shortcut), payment, delivery
 * method, when it was placed, and whether to show test or demo orders. Each row
 * opens the order; the current view can be exported as CSV.
 */
export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  await requireAdminPage(ORDERS_PATH);

  const now = new Date();
  const parsed = parseOrderListParams(await props.searchParams);
  const load = await loadOrderList(toOrderListQuery(parsed, now));

  if (!load.ok) {
    return (
      <>
        <AdminPageHeader title="Orders" description={ORDERS_DESCRIPTION} />
        <OrdersUnavailable reason={load.reason} className="mt-6" />
      </>
    );
  }

  const { page: { rows, total, page }, summary } = load.data;
  const params = { ...parsed, page };
  const filtered = hasOrderFilters(params);

  const filters: ListToolbarFilter[] = [
    { name: "status", label: "Order status", allLabel: "All statuses", options: STATUS_FILTER_OPTIONS },
    { name: "payment", label: "Payment", allLabel: "Any payment", options: PAYMENT_FILTER_OPTIONS },
    { name: "method", label: "Delivery method", allLabel: "Delivery and collection", options: METHOD_FILTER_OPTIONS },
    { name: "placed", label: "Placed", allLabel: "Any time", options: RANGE_FILTER_OPTIONS },
    { name: "show", label: "Show", allLabel: "Test and demo included", options: SHOW_FILTER_OPTIONS },
  ];

  return (
    <>
      <AdminPageHeader
        title="Orders"
        description={ORDERS_DESCRIPTION}
        actions={
          total > 0 ? (
            <div className="flex flex-col items-start gap-1 md:items-end">
              <Button asChild variant="outline" size="sm">
                <a href={buildListHref(ORDERS_EXPORT_PATH, params, { page: 1 })} download>
                  Export CSV<span className="sr-only"> of the orders shown</span>
                </a>
              </Button>
              {total > ORDERS_EXPORT_LIMIT ? (
                // Silently handing back a short file would be worse than saying so.
                <p className="text-caption text-muted-foreground md:text-right">
                  The file holds the first {formatNumber(ORDERS_EXPORT_LIMIT)}. Narrow the filters for the rest.
                </p>
              ) : null}
            </div>
          ) : null
        }
      />

      <OrdersSummary summary={summary} params={params} className="mt-6" />

      <ListToolbar
        className="mt-8"
        searchLabel="Search orders by number, name, email or phone"
        searchPlaceholder="Order number, name, email or phone"
        filters={filters}
      />

      <div className="mt-4">
        {rows.length > 0 ? (
          <OrdersTable rows={rows} params={params} now={now} />
        ) : (
          <div className="border bg-background-raised">
            {filtered ? (
              <AdminEmptyState
                as="h2"
                title={NO_MATCHES_TITLE}
                body={NO_MATCHES_BODY}
                action={
                  <Link href={buildListHref(ORDERS_PATH, params, { clear: true })} className="text-body-sm">
                    <span className="link-underline-static pb-0.5">Clear search and filters</span>
                  </Link>
                }
              />
            ) : (
              <AdminEmptyState as="h2" title={NO_ORDERS_TITLE} body={NO_ORDERS_BODY} />
            )}
          </div>
        )}
      </div>

      <Pagination base={ORDERS_PATH} params={params} total={total} noun={{ one: "order", other: "orders" }} />
    </>
  );
}
