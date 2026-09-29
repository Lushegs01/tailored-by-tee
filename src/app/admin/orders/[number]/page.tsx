import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Notice } from "@/components/admin/collections/notice";
import { customerHref } from "@/components/admin/customers/customer-rules";
import { OrderActions } from "@/components/admin/orders/order-actions";
import {
  DEMO_ORDER_NOTE,
  ITEMS_NOTE,
  NOTE_HINT,
  NO_ACTIONS_NOTE,
  PAYMENTS_NOTE,
  PAYSTACK_MISSING,
  REFUNDS_NOTE,
  REFUND_DUE_NOTE,
  TEST_PAYMENT_NOTE,
  TIMELINE_NOTE,
  phoneForDisplay,
  phoneHref,
  piecesSummary,
} from "@/components/admin/orders/order-copy";
import { OrderDelivery } from "@/components/admin/orders/order-delivery";
import { OrderFeedbackProvider } from "@/components/admin/orders/order-feedback";
import { OrderItemsTable, OrderTotals } from "@/components/admin/orders/order-items";
import { OrderNoteForm } from "@/components/admin/orders/order-note-form";
import { OrdersUnavailable } from "@/components/admin/orders/order-notices";
import { OrderPayments, OrderRefunds } from "@/components/admin/orders/order-payments";
import { OrderTimeline } from "@/components/admin/orders/order-timeline";
import { OrderTrackingForm } from "@/components/admin/orders/order-tracking-form";
import {
  AdminPageHeader,
  AdminSection,
  KeyValueList,
  StatusBadge,
  type KeyValueItem,
} from "@/components/admin/ui";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import { formatAdminDateTime, formatKobo } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import {
  ORDERS_PATH,
  availableActions,
  orderPath,
  type OrderAction,
} from "@/lib/admin/order-transitions";
import { loadAdminOrder, type AdminOrderDetail } from "@/lib/admin/orders";
import { orderStatusDisplay, paymentStatusDisplay } from "@/lib/admin/status";
import { isPaystackConfigured } from "@/lib/payments/paystack";

/*
 * /admin/orders/[number] — one order, and everything the studio does to it.
 *
 * Orders are addressed by the number the customer sees ("ORD-2026-001284"), not
 * an internal id, so a number read off an email or a parcel is enough to find the
 * order, and every other admin page links here the same way.
 *
 * The page renders what is true at this moment, and every step it offers carries
 * that moment with it: if the order has moved on since — a Paystack webhook, the
 * hold sweep, another admin — the step is refused and the page reloads rather
 * than applying a decision made about something that no longer exists.
 */

/** Order numbers are allocated by the shop; anything else never reaches the database. */
const NUMBER_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export async function generateMetadata(props: PageProps<"/admin/orders/[number]">): Promise<Metadata> {
  // Never look anything up for someone who isn't an admin.
  if (!(await getAdminUser())) return adminMetadata("Order");
  const { number } = await props.params;
  if (!NUMBER_PATTERN.test(number)) return adminMetadata("Order not found");
  const load = await loadAdminOrder(number);
  if (!load.ok) return adminMetadata("Orders");
  return adminMetadata(load.data ? `${load.data.number} — Orders` : "Order not found");
}

export default async function OrderPage(props: PageProps<"/admin/orders/[number]">) {
  const { number } = await props.params;
  await requireAdminPage(orderPath(number));
  if (!NUMBER_PATTERN.test(number)) notFound();

  const load = await loadAdminOrder(number);
  if (!load.ok) {
    return (
      <>
        <AdminPageHeader title="Order" breadcrumbs={[{ label: "Orders", href: ORDERS_PATH }]} />
        <OrdersUnavailable reason={load.reason} className="mt-6" />
      </>
    );
  }

  const order = load.data;
  if (!order) notFound();

  const now = new Date();
  const status = orderStatusDisplay(order, now);
  const isTest = order.payments.length > 0 && order.payments.every((payment) => payment.isTest);
  const payment = paymentStatusDisplay(order.paymentStatus, isTest);
  const paystackReady = isPaystackConfigured();

  // Paystack does the work of both payment steps; without keys neither is offered,
  // and the server refuses them in any case. The owner is told when that is why a
  // step they were expecting isn't there.
  const needsPaystack = (action: OrderAction) => action === "refund" || action === "recheck_payment";
  const allowedNow = availableActions(order.context);
  const actions = paystackReady ? allowedNow : allowedNow.filter((action) => !needsPaystack(action));
  const hidesPaymentSteps = !paystackReady && allowedNow.some(needsPaystack);

  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const restockablePieces = order.items.reduce(
    (sum, item) => sum + (item.variantId ? item.quantity : 0),
    0,
  );
  const refundDue = order.status === "CANCELLED" && order.context.paid && !order.context.fullyRefunded;
  const showTracking = order.deliveryMethod === "DELIVERY" && ["SHIPPED", "DELIVERED"].includes(order.status);

  return (
    <OrderFeedbackProvider>
      <div className="max-w-5xl">
        <AdminPageHeader
          title={order.number}
          breadcrumbs={[{ label: "Orders", href: ORDERS_PATH }, { label: order.number }]}
          description={`Placed ${formatAdminDateTime(order.createdAt)} · ${piecesSummary(order.items.length, pieces)} · ${formatKobo(order.total)}`}
          meta={
            <>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <StatusBadge tone={payment.tone}>{payment.label}</StatusBadge>
              {order.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
            </>
          }
        />

        <div className="mt-6 space-y-5">
          {refundDue ? (
            <Notice tone="critical" title="Refund due">
              <p>{REFUND_DUE_NOTE}</p>
            </Notice>
          ) : null}

          {order.isDemo ? (
            <Notice tone="info" title="Demo order">
              <p>{DEMO_ORDER_NOTE}</p>
            </Notice>
          ) : null}

          {isTest ? (
            <Notice tone="info" title="Test payment">
              <p>{TEST_PAYMENT_NOTE}</p>
            </Notice>
          ) : null}

          {hidesPaymentSteps ? (
            <Notice tone="warning" title="Paystack isn’t set up">
              <p>{PAYSTACK_MISSING}</p>
            </Notice>
          ) : null}

          <AdminSection title="What to do next" description={status.description}>
            {actions.length > 0 ? (
              <OrderActions
                number={order.number}
                status={order.status}
                updatedAt={order.updatedAt}
                deliveryMethod={order.deliveryMethod}
                actions={actions}
                carrier={order.carrier}
                trackingNumber={order.trackingNumber}
                refundable={order.refundable}
                restockablePieces={restockablePieces}
              />
            ) : (
              <p className="text-body-sm text-muted-foreground">{NO_ACTIONS_NOTE}</p>
            )}
          </AdminSection>

          <div className="grid gap-5 md:grid-cols-2">
            <AdminSection title="Customer">
              <CustomerDetails order={order} />
            </AdminSection>

            <AdminSection title={order.deliveryMethod === "PICKUP" ? "Collection" : "Delivery"}>
              <OrderDelivery order={order} />
            </AdminSection>
          </div>

          {showTracking ? (
            <AdminSection title="Courier details" description="Correct these without emailing the customer again.">
              <OrderTrackingForm
                number={order.number}
                status={order.status}
                updatedAt={order.updatedAt}
                carrier={order.carrier}
                trackingNumber={order.trackingNumber}
              />
            </AdminSection>
          ) : null}

          <AdminSection
            title="Pieces"
            description={ITEMS_NOTE}
            flush
            footer={<OrderTotals order={order} />}
          >
            <OrderItemsTable items={order.items} />
          </AdminSection>

          <AdminSection title="Payments" description={PAYMENTS_NOTE} flush>
            <OrderPayments payments={order.payments} />
          </AdminSection>

          {order.refunds.length > 0 ? (
            <AdminSection title="Refunds" description={REFUNDS_NOTE} flush>
              <OrderRefunds number={order.number} refunds={order.refunds} />
            </AdminSection>
          ) : null}

          <AdminSection title="Internal notes" description={NOTE_HINT}>
            <OrderNoteForm number={order.number} />
          </AdminSection>

          <AdminSection title="History" description={TIMELINE_NOTE}>
            <OrderTimeline events={order.events} deliveryMethod={order.deliveryMethod} now={now} />
          </AdminSection>
        </div>
      </div>
    </OrderFeedbackProvider>
  );
}

/** Who bought it, and where the rest of their orders are. */
function CustomerDetails({ order }: { order: AdminOrderDetail }) {
  const account = order.user;
  const phone = phoneForDisplay(order.phone);
  const dial = phoneHref(order.phone);

  const items: KeyValueItem[] = [
    { label: "Name", value: order.customerName },
    {
      label: "Email",
      value: (
        <a href={`mailto:${order.email}`} className="link-underline-static">
          {order.email}
        </a>
      ),
      breakAll: true,
    },
    {
      label: "Phone",
      value:
        phone && dial ? (
          <a href={dial} className="link-underline-static">
            {phone}
          </a>
        ) : phone,
    },
    {
      label: "Account",
      value: (
        <Link href={customerHref({ userId: order.userId, email: order.email })} className="link-underline-static">
          {account ? `Registered${account.name ? ` — ${account.name}` : ""}` : "Guest checkout — see their orders"}
        </Link>
      ),
    },
  ];

  return <KeyValueList items={items} />;
}
