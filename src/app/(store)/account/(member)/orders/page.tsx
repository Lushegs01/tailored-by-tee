import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { ArrowRightIcon } from "@/components/icons";
import { formatOrderDate } from "@/components/orders/format";
import { OrderThumbnail } from "@/components/orders/order-items";
import { orderStatusLabel } from "@/components/orders/order-status";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/auth/session";
import { pluralize } from "@/lib/format";
import { accountOrderPath } from "@/lib/orders/account-payment";
import { listOrdersForUser, type OrderSummary } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

const HISTORY_LIMIT = 50;

/** Order history. The account layout supplies the frame (Container, greeting, navigation). */
export default async function AccountOrdersPage() {
  // The layout checks too, but layouts and pages render in parallel.
  const user = await requireUser("/account/orders");
  const orders = await listOrdersForUser(user, { limit: HISTORY_LIMIT });
  const now = new Date();

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-display-sm">Orders</h1>
        <p className="mt-5 text-body text-muted-foreground">
          Orders placed while signed in, or with <span className="break-all">{user.email}</span>, newest first.
        </p>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          as="h2"
          align="start"
          size="sm"
          className="mt-10 border-t pt-8 md:mt-14"
          title="No orders *yet.*"
          body="Ordered with a different email? Sign in with that address to see it."
          actions={
            <Button asChild arrow>
              <Link href="/shop">Browse the shop</Link>
            </Button>
          }
        />
      ) : (
        <>
          <h2 className="sr-only">Your orders, newest first</h2>
          <ul className="mt-10 border-t md:mt-14">
            {orders.map((order) => (
              <li key={order.number} className="border-b">
                <OrderRow order={order} now={now} />
              </li>
            ))}
          </ul>

          {orders.length === HISTORY_LIMIT ? (
            <p className="mt-6 text-caption text-muted-foreground">
              Showing your {HISTORY_LIMIT} most recent orders. For an older one, email{" "}
              <a href={`mailto:${siteConfig.contact.email}`} className="link-underline-static text-foreground">
                {siteConfig.contact.email}
              </a>{" "}
              quoting its number.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * One order, the whole row a link. Stacked as a small card on phones; a single
 * aligned line (pieces, number and date, status, total) from tablet up.
 */
function OrderRow({ order, now }: { order: OrderSummary; now: Date }) {
  const status = orderStatusLabel(order, now);

  return (
    <Link
      href={accountOrderPath(order.number)}
      className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-4 py-6 md:flex md:items-center md:gap-x-6"
    >
      <div className="min-w-0 md:order-2 md:flex-1">
        <p className="text-body-sm font-medium break-words">
          <span className="link-underline pb-0.5 group-hover:bg-size-[100%_1px]">
            <span className="sr-only">Order </span>
            {order.number}
          </span>
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          <time dateTime={order.placedAt}>{formatOrderDate(order.placedAt)}</time>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {pluralize(order.itemCount, "piece")}
        </p>
      </div>

      <Price amount={order.total} className="justify-self-end text-body-sm md:order-4 md:w-28 md:justify-end" />

      {/* Wraps rather than overflows at 320px, where a long status badge needs the whole row. */}
      <div className="col-span-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 md:contents">
        {/* First piece on phones; up to three from sm, as on the overview. */}
        <div className="flex min-w-0 gap-2 md:order-1 md:w-40" aria-hidden="true">
          {order.previewItems.map((item, index) => (
            <OrderThumbnail
              key={`${item.name}-${index}`}
              imageUrl={item.imageUrl}
              className={cn("w-12", index > 0 && "hidden sm:block")}
            />
          ))}
        </div>
        <div className="md:order-3 md:w-40">
          <span className="sr-only">Status: </span>
          <OrderStatusBadge label={status.label} tone={status.tone} />
        </div>
      </div>

      <ArrowRightIcon
        aria-hidden="true"
        className="hidden shrink-0 text-muted-foreground transition-transform duration-500 ease-editorial group-hover:translate-x-1 group-hover:text-foreground md:order-5 md:block"
      />
    </Link>
  );
}
