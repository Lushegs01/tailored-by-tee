import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerAddressList } from "@/components/admin/customers/customer-addresses";
import { CustomerReviews, CustomerWishlist } from "@/components/admin/customers/customer-activity";
import { CustomerFigures, CustomerFiguresNote } from "@/components/admin/customers/customer-money";
import { CustomersUnavailable } from "@/components/admin/customers/customer-notices";
import {
  CustomerOrdersTable,
  MoreOrdersLink,
  NoCustomerOrders,
} from "@/components/admin/customers/customer-orders-table";
import {
  accountDisplay,
  CUSTOMERS_PATH,
  customerName,
  customerOrdersHref,
  customerPath,
  DEMO_NOTE,
  READ_ONLY_NOTE,
} from "@/components/admin/customers/customer-rules";
import { Notice } from "@/components/admin/collections/notice";
import { AdminPageHeader, AdminSection, KeyValueList, StatusBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import { CUSTOMER_ORDERS_SHOWN, getCustomerName, getRegisteredCustomer } from "@/lib/admin/customers";
import { formatAdminDate, formatAdminDateTime, formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { formatNigerianPhone } from "@/lib/commerce/phone";

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,191}$/;

export async function generateMetadata(props: PageProps<"/admin/customers/[id]">): Promise<Metadata> {
  // Never look anything up for someone who isn't an admin.
  if (!(await getAdminUser())) return adminMetadata("Customer");
  const { id } = await props.params;
  const name = ID_PATTERN.test(id) ? await getCustomerName(id) : null;
  return adminMetadata(name ? `${name} — Customers` : "Customer not found");
}

/**
 * /admin/customers/[id] — one registered customer, read-only: their profile,
 * saved addresses, orders, wishlist and reviews.
 *
 * Their orders are the ones their own account shows them: placed while signed in,
 * or placed with their email address — so guest orders from before they
 * registered are here too. An order checked out with a different address is
 * marked, so the figures are never a mystery.
 */
export default async function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  const { id } = await props.params;
  await requireAdminPage(customerPath(id));
  if (!ID_PATTERN.test(id)) notFound();

  const load = await getRegisteredCustomer(id);
  if (!load.ok) {
    return (
      <>
        <AdminPageHeader title="Customer" breadcrumbs={[{ label: "Customers", href: CUSTOMERS_PATH }]} />
        <CustomersUnavailable reason={load.reason} className="mt-6" />
      </>
    );
  }
  if (!load.data) notFound();

  const { profile, totals, orders } = load.data;
  const now = new Date();
  const name = customerName(profile);
  const account = accountDisplay(true);

  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title={name}
        breadcrumbs={[{ label: "Customers", href: CUSTOMERS_PATH }, { label: name }]}
        meta={
          <>
            <StatusBadge tone={account.tone}>{account.label}</StatusBadge>
            {profile.isAdmin ? <StatusBadge tone="info">Administrator</StatusBadge> : null}
            {profile.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
            <span className="break-all text-muted-foreground">{profile.email}</span>
          </>
        }
        description={`${account.description} ${READ_ONLY_NOTE}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={customerOrdersHref(profile.email)}>Find their orders</Link>
          </Button>
        }
      />

      {profile.isDemo ? (
        <Notice tone="warning" title="Demo customer" className="mt-6">
          <p>{DEMO_NOTE}</p>
        </Notice>
      ) : null}

      {profile.isAdmin ? (
        <Notice tone="info" title="This customer is an administrator" className="mt-6">
          <p>
            They can see and change everything in the admin area. Admin access is given and taken away in{" "}
            <Link href="/admin/settings#team">
              <span className="link-underline-static pb-0.5">Settings</span>
            </Link>
            .
          </p>
        </Notice>
      ) : null}

      <CustomerFigures totals={totals} email={profile.email} now={now} className="mt-6" />
      <CustomerFiguresNote totals={totals} className="mt-3" />

      <div className="mt-6 space-y-6">
        <AdminSection
          title="Details"
          description="From their account. They change these themselves when they sign in."
        >
          <KeyValueList
            columns={2}
            items={[
              { label: "Name", value: profile.name },
              {
                label: "Email",
                breakAll: true,
                value: (
                  <a href={`mailto:${encodeURIComponent(profile.email)}`} className="break-all">
                    <span className="link-underline-static pb-0.5">{profile.email}</span>
                  </a>
                ),
              },
              {
                label: "Phone",
                value: profile.phone ? (
                  <span className="tabular-nums">{formatNigerianPhone(profile.phone)}</span>
                ) : null,
              },
              {
                label: "Account created",
                value: (
                  <time dateTime={profile.createdAt} title={formatAdminDateTime(profile.createdAt)}>
                    {formatAdminDate(profile.createdAt)}
                  </time>
                ),
              },
              {
                label: "Signed in",
                value: profile.hasSignedIn
                  ? "Yes, at least once"
                  : "Not yet — the account exists but nobody has signed in to it",
              },
              { label: "Access", value: profile.isAdmin ? "Administrator" : "Customer" },
            ]}
          />
        </AdminSection>

        <AdminSection
          title="Saved addresses"
          description="Addresses kept in their account for a quicker checkout. Each order also keeps its own copy of where it went."
        >
          <CustomerAddressList addresses={profile.addresses} />
        </AdminSection>

        <AdminSection
          title="Orders"
          description="Orders placed while signed in, and orders placed with this email address before they had an account."
          flush
          footer={
            totals.ordersTotal > orders.length ? (
              <MoreOrdersLink email={profile.email} shown={Math.min(orders.length, CUSTOMER_ORDERS_SHOWN)} total={totals.ordersTotal} />
            ) : undefined
          }
        >
          {orders.length > 0 ? (
            <CustomerOrdersTable orders={orders} email={profile.email} now={now} />
          ) : (
            <NoCustomerOrders registered />
          )}
        </AdminSection>

        <AdminSection
          title="Saved pieces"
          description={`Their wishlist${profile.wishlist.count > 0 ? ` — ${formatNumber(profile.wishlist.count)} saved` : ""}.`}
        >
          <CustomerWishlist count={profile.wishlist.count} items={profile.wishlist.items} />
        </AdminSection>

        <AdminSection
          title="Reviews written"
          description="Approve or reject these on the Reviews page, where the whole review is shown."
        >
          <CustomerReviews reviews={profile.reviews} count={profile.reviewCount} />
        </AdminSection>
      </div>
    </div>
  );
}
