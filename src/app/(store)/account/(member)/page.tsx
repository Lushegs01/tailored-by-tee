import type { Metadata } from "next";
import Link from "next/link";

import { AccountSection } from "@/components/account/account-section";
import { formatOrderDate } from "@/components/orders/format";
import { OrderThumbnail } from "@/components/orders/order-items";
import { orderStatusLabel } from "@/components/orders/order-status";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Price } from "@/components/ui/price";
import { findState } from "@/config/nigeria";
import { getDefaultAddress, type SavedAddress } from "@/lib/account/addresses";
import { getProfile } from "@/lib/account/profile";
import { countWishlistItems } from "@/lib/account/wishlist";
import { requireUser } from "@/lib/auth/session";
import { formatNigerianPhone } from "@/lib/commerce/phone";
import { pluralize } from "@/lib/format";
import { accountOrderPath } from "@/lib/orders/account-payment";
import { listOrdersForUser, type OrderSummary } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/** Overview: the latest few orders, the default address, saved pieces and contact details. */
export default async function AccountOverviewPage() {
  // The layout checks too, but layouts and pages render in parallel.
  const user = await requireUser("/account");

  const [orders, address, savedCount, profile] = await Promise.all([
    listOrdersForUser(user, { limit: 3 }),
    getDefaultAddress(user.id),
    countWishlistItems(user.id),
    getProfile(user.id),
  ]);

  const now = new Date();

  return (
    <div className="space-y-14">
      {/* The layout's greeting is the visible title. */}
      <h1 className="sr-only">Your account</h1>

      <AccountSection
        id="account-orders"
        title="Recent orders"
        action={
          orders.length > 0
            ? { label: "All orders", href: "/account/orders" }
            : { label: "Shop new arrivals", href: "/shop/new-arrivals" }
        }
      >
        {orders.length > 0 ? (
          <ul className="border-b [&>li+li]:border-t">
            {orders.map((order) => (
              <li key={order.number}>
                <OrderRow order={order} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-md text-body-sm text-muted-foreground">
            No orders yet. Orders you place while signed in — and any placed as a guest with{" "}
            <span className="break-all">{user.email}</span> — will appear here.
          </p>
        )}
      </AccountSection>

      <div className="grid gap-x-10 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
        <AccountSection
          id="account-address"
          title="Default address"
          action={
            address
              ? { label: "Manage addresses", href: "/account/addresses" }
              : { label: "Add an address", href: "/account/addresses" }
          }
        >
          {address ? (
            <AddressBlock address={address} />
          ) : (
            <p className="text-body-sm text-muted-foreground">
              You haven&rsquo;t saved an address yet. Keep one here and it&rsquo;s ready when you next order.
            </p>
          )}
        </AccountSection>

        <AccountSection
          id="account-saved"
          title="Saved pieces"
          action={
            savedCount > 0
              ? { label: "View wishlist", href: "/wishlist" }
              : { label: "Browse the shop", href: "/shop" }
          }
        >
          <p className="text-body-sm text-muted-foreground">
            {savedCount > 0
              ? `${pluralize(savedCount, "piece")} saved to your wishlist.`
              : "Nothing saved yet. Use the heart on any piece to keep it here for later."}
          </p>
        </AccountSection>

        <AccountSection
          id="account-details"
          title="Details"
          className="sm:col-span-2 xl:col-span-1"
          action={{ label: "Edit", href: "/account/profile", ariaLabel: "Edit your details" }}
        >
          <dl className="space-y-4 text-body-sm">
            <Detail term="Name">{profile?.name ?? user.name ?? <NotAdded />}</Detail>
            <Detail term="Email">
              <span className="break-all">{profile?.email ?? user.email}</span>
            </Detail>
            <Detail term="Phone">{profile?.phone ? formatNigerianPhone(profile.phone) : <NotAdded />}</Detail>
          </dl>
        </AccountSection>
      </div>
    </div>
  );
}

function OrderRow({ order, now }: { order: OrderSummary; now: Date }) {
  const status = orderStatusLabel(order, now);

  return (
    <Link href={accountOrderPath(order.number)} className="group flex items-start gap-4 py-5">
      <OrderThumbnails items={order.previewItems} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <p className="min-w-0 text-body-sm font-medium break-words">
            <span className="link-underline pb-0.5 group-hover:bg-size-[100%_1px]">
              <span className="sr-only">Order </span>
              {order.number}
            </span>
          </p>
          <Price amount={order.total} className="shrink-0 text-body-sm" />
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          <time dateTime={order.placedAt}>{formatOrderDate(order.placedAt)}</time>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {pluralize(order.itemCount, "piece")}
        </p>
        <p className="mt-3">
          <span className="sr-only">Status: </span>
          <OrderStatusBadge label={status.label} tone={status.tone} />
        </p>
      </div>
    </Link>
  );
}

/** First piece on phones; up to three from sm. Decorative — the row's text names the order. */
function OrderThumbnails({ items }: { items: OrderSummary["previewItems"] }) {
  if (items.length === 0) return <div aria-hidden="true" className="aspect-4/5 w-12 shrink-0 bg-surface" />;

  return (
    <div aria-hidden="true" className="flex shrink-0 gap-1.5">
      {items.slice(0, 3).map((item, index) => (
        <OrderThumbnail
          key={`${item.name}-${index}`}
          imageUrl={item.imageUrl}
          className={cn("w-12", index > 0 && "hidden sm:block")}
        />
      ))}
    </div>
  );
}

function AddressBlock({ address }: { address: SavedAddress }) {
  const state = findState(address.state)?.name ?? address.state;
  const locality = [address.city, state, address.postalCode].filter(Boolean).join(", ");

  return (
    <address className="text-body-sm break-words not-italic">
      {address.label ? <span className="mb-2 block text-caption text-muted-foreground">{address.label}</span> : null}
      <span className="block">{address.fullName}</span>
      <span className="block text-muted-foreground">{address.line1}</span>
      {address.line2 ? <span className="block text-muted-foreground">{address.line2}</span> : null}
      <span className="block text-muted-foreground">{locality}</span>
      <span className="mt-2 block text-muted-foreground">{formatNigerianPhone(address.phone)}</span>
    </address>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function NotAdded() {
  return <span className="text-muted-foreground">Not added yet</span>;
}
