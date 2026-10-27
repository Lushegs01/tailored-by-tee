import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { ChevronLeftIcon } from "@/components/icons";
import { formatOrderDate, lagosTime } from "@/components/orders/format";
import { OrderBreakdown } from "@/components/orders/order-breakdown";
import { orderState, orderStatusLabel, type OrderState } from "@/components/orders/order-status";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PayOrderButton } from "@/components/orders/pay-order-button";
import { TextLink } from "@/components/ui/text-link";
import { requireUser } from "@/lib/auth/session";
import { getCheckoutMode, paymentsAreTest, type CheckoutMode } from "@/lib/commerce/checkout-mode";
import { formatPrice } from "@/lib/format";
import { accountOrderPath } from "@/lib/orders/account-payment";
import { getOrderForUser } from "@/lib/orders/queries";
import { sweepExpiredReservations } from "@/lib/orders/reservations";
import type { OrderView } from "@/lib/orders/types";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

/** One or two sentences on where the order stands and what, if anything, happens next. */
function statusMessage(order: OrderView, state: OrderState, mode: CheckoutMode): string {
  switch (state) {
    case "needs_refund":
      return "Your payment arrived after the hold ended, and some of these pieces had sold in the meantime. We’ll refund you in full; you’ll hear from us within one working day.";
    case "released":
      return "Payment wasn’t completed in time, so these pieces went back on sale. You haven’t been charged.";
    case "hold_ended":
      return "Payment wasn’t completed in time, so these pieces are going back on sale. You haven’t been charged — you’re welcome to order them again.";
    case "awaiting_payment": {
      const until = order.reservedUntil ? lagosTime.format(new Date(order.reservedUntil)) : null;
      const held = until ? `We’re holding your pieces until ${until}.` : "We’re holding your pieces.";
      if (mode !== "live") {
        return `${held} Online payment isn’t connected yet, so this is a test order — nothing has been charged.`;
      }
      const retry = order.lastPayment?.status === "failed" || order.lastPayment?.status === "abandoned";
      return `${held} ${retry ? "Your last payment didn’t go through — you can try again below." : "Complete payment to confirm your order."}`;
    }
    case "paid":
      break;
  }

  switch (order.status) {
    case "refunded":
      return "This order has been refunded in full.";
    case "processing":
      return `We’re preparing your pieces in the studio. We’ll email ${order.email} when they leave.`;
    case "shipped":
      return "Your pieces have left the studio.";
    case "delivered":
      return order.delivery.method === "pickup" ? "Your pieces have been collected." : "Your pieces have been delivered.";
    default:
      return `Your order is confirmed. We’ll email ${order.email} as soon as it leaves the studio.`;
  }
}

/** One order in the account. The account layout supplies the frame (Container, greeting, navigation). */
export default async function AccountOrderPage({ params }: PageProps<"/account/orders/[number]">) {
  const { number } = await params;
  // The layout checks too, but layouts and pages render in parallel.
  const user = await requireUser(accountOrderPath(number));

  // Not theirs and doesn't exist look the same: a plain 404.
  const order = await getOrderForUser(user, number);
  if (!order) notFound();

  // Return stock from any lapsed holds once this page has been sent.
  after(() => sweepExpiredReservations());

  const now = new Date();
  const mode = getCheckoutMode();
  const state = orderState(order, now);
  const status = orderStatusLabel(order, now);
  const canPay =
    state === "awaiting_payment" &&
    mode === "live" &&
    order.reservedUntil !== null &&
    new Date(order.reservedUntil) > now;
  const testPayment = state === "paid" && (order.lastPayment?.isTest ?? false);

  return (
    <div>
      {/* The navigation already marks Orders; this is the one step back. */}
      <Link
        href="/account/orders"
        className="-ml-1 inline-flex min-h-8 items-center gap-1.5 text-caption text-muted-foreground transition-colors duration-300 hover:text-foreground"
      >
        <ChevronLeftIcon />
        <span className="link-underline pb-0.5">All orders</span>
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="text-eyebrow text-muted-foreground">
          Placed <time dateTime={order.placedAt}>{formatOrderDate(order.placedAt)}</time>
        </p>
        <OrderStatusBadge label={status.label} tone={status.tone} />
      </div>
      <h1 className="mt-5 font-display text-display-sm break-words">
        <span className="sr-only">Order </span>
        {order.number}
      </h1>
      <p className="mt-5 max-w-xl text-body text-muted-foreground">{statusMessage(order, state, mode)}</p>

      {testPayment ? (
        <p className="mt-6 inline-block border border-accent-brand/40 px-3 py-1.5 text-eyebrow text-accent-brand">
          Test payment — no money moved
        </p>
      ) : null}

      {canPay ? (
        <div className="mt-10">
          <PayOrderButton orderNumber={order.number} label={`Pay ${formatPrice(order.totals.total)} with Paystack`} />
          {paymentsAreTest() ? (
            <p className="mt-3 text-caption text-muted-foreground">
              Paystack test mode — use a Paystack test card. No real money moves.
            </p>
          ) : null}
        </div>
      ) : null}

      <OrderBreakdown order={order} paid={state === "paid"} />

      <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-5 border-t pt-10">
        <TextLink href="/account/orders">All your orders</TextLink>
        <TextLink href="/shop">Continue shopping</TextLink>
      </div>
    </div>
  );
}
