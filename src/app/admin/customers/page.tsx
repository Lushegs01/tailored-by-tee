import Link from "next/link";

import { CustomersUnavailable, CustomerNote } from "@/components/admin/customers/customer-notices";
import {
  CUSTOMER_ACCOUNT_OPTIONS,
  CUSTOMER_LIST_ALLOWED,
  CUSTOMER_ORDERS_OPTIONS,
  CUSTOMERS_PATH,
  hasCustomerFilters,
  READ_ONLY_NOTE,
  SPEND_NOTE,
  TEST_MONEY_NOTE,
  toCustomerListQuery,
} from "@/components/admin/customers/customer-rules";
import { CustomersTable } from "@/components/admin/customers/customers-table";
import {
  AdminEmptyState,
  AdminPageHeader,
  ListToolbar,
  Pagination,
  Stat,
  StatGrid,
  type ListToolbarFilter,
} from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { listCustomers } from "@/lib/admin/customers";
import { formatKobo, formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { buildListHref, parseListParams } from "@/lib/admin/pagination";

export const metadata = adminMetadata("Customers");

const DESCRIPTION =
  "Everyone who has bought from the shop or created an account. The shop doesn’t make anyone register, so guests and account holders sit side by side, one row per email address.";

const FILTERS: ListToolbarFilter[] = [
  { name: "account", label: "Account", allLabel: "Everyone", options: [...CUSTOMER_ACCOUNT_OPTIONS] },
  { name: "orders", label: "Orders", allLabel: "Ordered or not", options: [...CUSTOMER_ORDERS_OPTIONS] },
];

/**
 * /admin/customers — one row per customer email address, whether or not they
 * created an account. Search by name, email or phone number (?q=), filter by
 * account (?account=registered|guest) and by whether they have ever ordered
 * (?orders=with|without), and sort by last order (the default), total spent,
 * orders, when they joined or name.
 *
 * Read-only: customer details belong to the customer, and admin access is given
 * and taken away in Settings.
 */
export default async function CustomersPage(props: PageProps<"/admin/customers">) {
  await requireAdminPage(CUSTOMERS_PATH);

  const parsed = parseListParams(await props.searchParams, CUSTOMER_LIST_ALLOWED);
  const query = toCustomerListQuery(parsed);
  const load = await listCustomers(query);

  if (!load.ok) {
    return (
      <>
        <AdminPageHeader title="Customers" description={DESCRIPTION} />
        <CustomersUnavailable reason={load.reason} className="mt-6" />
      </>
    );
  }

  const { rows, total, page, summary } = load.data;
  const params = { ...parsed, page };
  const filtered = hasCustomerFilters(query);
  const guests = Math.max(0, summary.total - summary.registered);

  return (
    <>
      <AdminPageHeader title="Customers" description={DESCRIPTION} />

      <StatGrid className="mt-6">
        <Stat
          label={query.q === "" ? "Customers" : "Matching customers"}
          value={formatNumber(summary.total)}
          hint={summary.demo > 0 ? `${formatNumber(summary.demo)} of them demo content` : "One per email address"}
        />
        <Stat
          label="With an account"
          value={formatNumber(summary.registered)}
          hint="They can sign in and see their orders"
          href={buildListHref(CUSTOMERS_PATH, params, { filters: { account: "registered" } })}
        />
        <Stat
          label="Guest checkouts"
          value={formatNumber(guests)}
          hint="Bought without creating an account"
          href={buildListHref(CUSTOMERS_PATH, params, { filters: { account: "guest" } })}
        />
        <Stat
          label="Total spent"
          value={formatKobo(summary.spent)}
          hint={`Across ${formatNumber(summary.paidOrders)} paid ${summary.paidOrders === 1 ? "order" : "orders"}`}
        />
      </StatGrid>

      <CustomerNote className="mt-3">
        {SPEND_NOTE}
        {summary.testSpent > 0 ? <> {TEST_MONEY_NOTE}</> : null} {READ_ONLY_NOTE}
      </CustomerNote>

      <ListToolbar
        className="mt-6"
        searchLabel="Search customers by name, email or phone number"
        searchPlaceholder="Name, email or phone"
        filters={FILTERS}
      />

      <div className="mt-4">
        {rows.length > 0 ? (
          <CustomersTable rows={rows} params={params} now={new Date()} />
        ) : (
          <div className="border bg-background-raised">
            {filtered ? (
              <AdminEmptyState
                as="h2"
                title="Nobody matches"
                body="No customer matches this search and these filters. Try a different search, or clear them."
                action={
                  <Link href={buildListHref(CUSTOMERS_PATH, params, { clear: true })} className="text-body-sm">
                    <span className="link-underline-static pb-0.5">Clear search and filters</span>
                  </Link>
                }
              />
            ) : (
              <AdminEmptyState
                as="h2"
                title="No customers yet"
                body="As soon as someone buys something or creates an account, they appear here with their orders and what they’ve spent."
              />
            )}
          </div>
        )}
      </div>

      <Pagination
        base={CUSTOMERS_PATH}
        params={params}
        total={total}
        noun={{ one: "customer", other: "customers" }}
      />
    </>
  );
}
