import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { enabledSignInMethods } from "@/auth";
import { PayNowButton } from "@/components/checkout/pay-now-button";
import { lagosTime } from "@/components/orders/format";
import { OrderBreakdown } from "@/components/orders/order-breakdown";
import { orderState, type OrderState } from "@/components/orders/order-status";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { TextLink } from "@/components/ui/text-link";
import { getCurrentUser, signInPath, type CurrentUser } from "@/lib/auth/session";
import { getCheckoutMode, paymentsAreTest, type CheckoutMode } from "@/lib/commerce/checkout-mode";
import { formatPrice } from "@/lib/format";
import { accountOrderPath } from "@/lib/orders/account-payment";
import { findOrderForUser, getOrderByAccessKey } from "@/lib/orders/queries";
import { sweepExpiredReservations } from "@/lib/orders/reservations";
import type { OrderView } from "@/lib/orders/types";

// Private: reachable only with the secret in its link, and never indexed.
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

function headline(order: OrderView, state: OrderState, mode: CheckoutMode): { title: string; body: string } {
  const firstName = order.customerName.split(/\s+/)[0]?.replace(/\*/g, "") ?? "";

  switch (state) {
    case "paid":
      return {
        title: `Thank you, *${firstName}.*`,
        body: `Your order is confirmed. We’ll email ${order.email} as soon as it leaves the studio.`,
      };
    case "needs_refund":
      return {
        title: "Payment received — *refund on its way.*",
        body: "Your payment arrived after your hold ended, and some of these pieces had sold in the meantime. We’ll refund you in full; you’ll hear from us within one working day.",
      };
    case "released":
      return {
        title: "This order has been *released.*",
        body: "Payment wasn’t completed in time, so these pieces went back on sale. You haven’t been charged.",
      };
    case "hold_ended":
      return {
        title: "This hold has *ended.*",
        body: "Payment wasn’t completed in time, so these pieces are going back on sale. You haven’t been charged — you’re welcome to order them again.",
      };
    case "awaiting_payment": {
      const until = order.reservedUntil ? lagosTime.format(new Date(order.reservedUntil)) : null;
      const held = until ? `We’re holding them for you until ${until}.` : "We’re holding them for you.";
      if (mode !== "live") {
        return {
          title: "Your pieces are *reserved.*",
          body: `${held} Online payment isn’t connected yet, so this is a test order — nothing has been charged.`,
        };
      }
      const retry = order.lastPayment?.status === "failed" || order.lastPayment?.status === "abandoned";
      return {
        title: "Your pieces are *reserved.*",
        body: `${held} ${retry ? "Your last payment didn’t go through — you can try again below." : "Complete payment to confirm your order."}`,
      };
    }
  }
}

/** Whether the signed-in viewer will find this order in their account. A failed lookup just hides the link. */
async function isInAccount(viewer: CurrentUser | null, orderNumber: string): Promise<boolean> {
  if (!viewer) return false;
  try {
    return (await findOrderForUser(viewer, orderNumber)) !== null;
  } catch (error) {
    console.error("[orders] could not check the account for an order", error instanceof Error ? error.message : error);
    return false;
  }
}

export default async function OrderCompletePage({ params, searchParams }: PageProps<"/checkout/complete/[number]">) {
  const [{ number }, { key }] = await Promise.all([params, searchParams]);
  const accessKey = typeof key === "string" ? key : "";
  const order = await getOrderByAccessKey(number, accessKey);
  if (!order) notFound();

  // Return stock from any lapsed holds once this page has been sent.
  after(() => sweepExpiredReservations());

  const mode = getCheckoutMode();
  const state = orderState(order, new Date());
  const copy = headline(order, state, mode);
  const testPayment = order.lastPayment?.isTest ?? false;

  // This page is already dynamic (it reads the link's key), so reading the session costs nothing extra.
  const viewer = await getCurrentUser();
  const inAccount = await isInAccount(viewer, order.number);
  const accountsEnabled = enabledSignInMethods.email || enabledSignInMethods.google;

  return (
    <Container className="pt-10 pb-24 md:pt-16 md:pb-32">
      <div className="mx-auto max-w-5xl">
        <p className="text-eyebrow text-muted-foreground">Order {order.number}</p>
        <h1 className="mt-5 font-display text-display-md">
          <Emphasis text={copy.title} />
        </h1>
        <p className="mt-6 max-w-xl text-lead text-muted-foreground">{copy.body}</p>

        {state === "paid" && testPayment ? (
          <p className="mt-6 inline-block border border-accent-brand/40 px-3 py-1.5 text-eyebrow text-accent-brand">
            Test payment — no money moved
          </p>
        ) : null}

        {state === "awaiting_payment" && mode === "live" ? (
          <div className="mt-10">
            <PayNowButton
              orderNumber={order.number}
              accessKey={accessKey}
              label={`Pay ${formatPrice(order.totals.total)} with Paystack`}
            />
            {paymentsAreTest() ? (
              <p className="mt-3 text-caption text-muted-foreground">
                Paystack test mode — use a Paystack test card. No real money moves.
              </p>
            ) : null}
          </div>
        ) : null}

        <OrderBreakdown order={order} paid={state === "paid"} />

        <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-4 border-t pt-10">
          <Button asChild variant={state === "awaiting_payment" && mode === "live" ? "outline" : "primary"} arrow>
            <Link href="/shop">Continue shopping</Link>
          </Button>
          <p className="text-caption text-muted-foreground">Keep this page&rsquo;s link to check on your order later.</p>
        </div>

        {inAccount ? (
          <TextLink href={accountOrderPath(order.number)} className="mt-8">
            View in your account
          </TextLink>
        ) : !viewer && accountsEnabled ? (
          <p className="mt-8 max-w-xl text-body-sm break-words text-muted-foreground">
            <Link
              href={signInPath(accountOrderPath(order.number))}
              className="link-underline-static text-foreground"
            >
              Sign in with {order.email}
            </Link>{" "}
            to see all your orders in one place.
          </p>
        ) : null}
      </div>
    </Container>
  );
}
