import Link from "next/link";
import { redirect } from "next/navigation";

import { Notice } from "@/components/admin/collections/notice";
import { GuestLastAddress } from "@/components/admin/customers/customer-addresses";
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
  customerOrdersHref,
  customerPath,
  DEMO_NOTE,
  GUEST_CUSTOMER_PATH,
  normaliseCustomerEmail,
  READ_ONLY_NOTE,
} from "@/components/admin/customers/customer-rules";
import { AdminEmptyState, AdminPageHeader, AdminSection, KeyValueList, StatusBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { findCustomerByEmail, getGuestCustomer } from "@/lib/admin/customers";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { formatNigerianPhone } from "@/lib/commerce/phone";

export const metadata = adminMetadata("Guest customer");

const BREADCRUMBS = [{ label: "Customers", href: CUSTOMERS_PATH }];

/** A panel in place of the page, for an address that isn't one or has never ordered. */
function GuestNotFound({ title, body }: { title: string; body: string }) {
  return (
    <>
      <AdminPageHeader title="Guest customer" breadcrumbs={BREADCRUMBS} />
      <div className="mt-6 border bg-background-raised">
        <AdminEmptyState
          as="h2"
          title={title}
          body={body}
          action={
            <Link href={CUSTOMERS_PATH} className="text-body-sm">
              <span className="link-underline-static pb-0.5">Back to customers</span>
            </Link>
          }
        />
      </div>
    </>
  );
}

/**
 * /admin/customers/guest?email=… — everything one address has ordered without an
 * account. Guests have no record of their own, so this view is keyed by the
 * address they checked out with; if an account has since been created with it,
 * the owner is sent to that account's page instead.
 *
 * "guest" is a fixed segment, so it wins over /admin/customers/[id]. Ids here are
 * cuids (or demo_user_… ids), none of which is the word "guest", so no account is
 * shadowed by it.
 */
export default async function GuestCustomerPage(props: PageProps<"/admin/customers/guest">) {
  await requireAdminPage(GUEST_CUSTOMER_PATH);

  const searchParams = await props.searchParams;
  const raw = Array.isArray(searchParams.email) ? searchParams.email[0] : searchParams.email;
  const email = normaliseCustomerEmail(raw);
  if (!email) {
    return (
      <GuestNotFound
        title="That isn’t an email address"
        body="This page shows what one address has ordered without an account. Open a guest from the customers list to get here."
      />
    );
  }

  // An account may have been created with this address since the order was
  // placed. This has to be settled before anything is shown: without an answer
  // we could label an account holder a guest, so a failure here stops the page
  // rather than being ignored.
  const account = await findCustomerByEmail(email);
  if (!account.ok) {
    return (
      <>
        <AdminPageHeader title="Guest customer" breadcrumbs={BREADCRUMBS} />
        <CustomersUnavailable reason={account.reason} className="mt-6" />
      </>
    );
  }
  if (account.data) redirect(customerPath(account.data.id));

  const load = await getGuestCustomer(email);
  if (!load.ok) {
    return (
      <>
        <AdminPageHeader title="Guest customer" breadcrumbs={BREADCRUMBS} />
        <CustomersUnavailable reason={load.reason} className="mt-6" />
      </>
    );
  }
  if (!load.data) {
    return (
      <GuestNotFound
        title="Nothing has been ordered with this address"
        body="There is no account with it either, so there is nothing to show."
      />
    );
  }

  const guest = load.data;
  const now = new Date();
  const name = guest.name ?? guest.email;
  const display = accountDisplay(false);

  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title={name}
        breadcrumbs={[...BREADCRUMBS, { label: name }]}
        meta={
          <>
            <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
            {guest.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
            <span className="break-all text-muted-foreground">{guest.email}</span>
          </>
        }
        description={`${display.description} ${READ_ONLY_NOTE}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={customerOrdersHref(guest.email)}>Find their orders</Link>
          </Button>
        }
      />

      {guest.isDemo ? (
        <Notice tone="warning" title="Demo customer" className="mt-6">
          <p>{DEMO_NOTE}</p>
        </Notice>
      ) : null}

      <CustomerFigures totals={guest.totals} email={guest.email} now={now} className="mt-6" />
      <CustomerFiguresNote totals={guest.totals} className="mt-3" />

      <div className="mt-6 space-y-6">
        <AdminSection
          title="Details"
          description="Taken from their most recent order. There is no account, so nothing here is saved between visits."
        >
          <KeyValueList
            columns={2}
            items={[
              { label: "Name", value: guest.name },
              {
                label: "Email",
                breakAll: true,
                value: (
                  <a href={`mailto:${encodeURIComponent(guest.email)}`} className="break-all">
                    <span className="link-underline-static pb-0.5">{guest.email}</span>
                  </a>
                ),
              },
              {
                label: "Phone",
                value: guest.phone ? <span className="tabular-nums">{formatNigerianPhone(guest.phone)}</span> : null,
              },
              { label: "Account", value: "None — they check out as a guest" },
              {
                label: "First order",
                value: guest.totals.firstOrderAt ? (
                  <time
                    dateTime={guest.totals.firstOrderAt}
                    title={formatAdminDateTime(guest.totals.firstOrderAt)}
                  >
                    {formatAdminDate(guest.totals.firstOrderAt)}
                  </time>
                ) : null,
              },
              {
                label: "Last order",
                value: guest.totals.lastOrderAt ? (
                  <time dateTime={guest.totals.lastOrderAt} title={formatAdminDateTime(guest.totals.lastOrderAt)}>
                    {formatAdminDate(guest.totals.lastOrderAt)}
                  </time>
                ) : null,
              },
            ]}
          />
        </AdminSection>

        <AdminSection title="Last delivery address" description="Where their most recent order went.">
          <GuestLastAddress address={guest.lastAddress} />
        </AdminSection>

        <AdminSection
          title="Orders"
          description="Every order placed with this address."
          flush
          footer={
            guest.totals.ordersTotal > guest.orders.length ? (
              <MoreOrdersLink email={guest.email} shown={guest.orders.length} total={guest.totals.ordersTotal} />
            ) : undefined
          }
        >
          {guest.orders.length > 0 ? (
            <CustomerOrdersTable orders={guest.orders} email={guest.email} now={now} />
          ) : (
            <NoCustomerOrders registered={false} />
          )}
        </AdminSection>
      </div>
    </div>
  );
}
