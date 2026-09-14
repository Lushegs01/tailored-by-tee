import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { MediaImage } from "@/components/ui/media-image";
import { Price } from "@/components/ui/price";
import { siteConfig } from "@/config/site";
import { getCheckoutMode } from "@/lib/commerce/checkout-mode";
import { formatNigerianPhone } from "@/lib/commerce/phone";
import { formatPrice } from "@/lib/format";
import { getOrderByAccessKey } from "@/lib/orders/queries";
import type { OrderView } from "@/lib/orders/types";

// Private: reachable only with the secret in its link, and never indexed or cached by crawlers.
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

const lagosTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  hour: "numeric",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});

function headline(order: OrderView, testMode: boolean): { title: string; body: string } {
  const firstName = order.customerName.split(/\s+/)[0]?.replace(/\*/g, "") ?? "";

  if (order.status === "cancelled") {
    return {
      title: "This order has been *released.*",
      body: "Payment wasn’t completed in time, so these pieces went back on sale. You haven’t been charged.",
    };
  }
  if (order.paymentStatus === "success" || order.status !== "pending") {
    return {
      title: `Thank you, *${firstName}.*`,
      body: `Your order is confirmed. We’ll email ${order.email} as soon as it leaves the studio.`,
    };
  }
  const until = order.reservedUntil ? lagosTime.format(new Date(order.reservedUntil)) : null;
  return {
    title: "Your pieces are *reserved.*",
    body: [
      until ? `We’re holding them for you until ${until}.` : "We’re holding them for you.",
      testMode
        ? "Online payment isn’t connected yet, so this is a test order — nothing has been charged."
        : "Complete payment to confirm your order.",
    ].join(" "),
  };
}

export default async function OrderCompletePage({ params, searchParams }: PageProps<"/checkout/complete/[number]">) {
  const [{ number }, { key }] = await Promise.all([params, searchParams]);
  const order = await getOrderByAccessKey(number, typeof key === "string" ? key : "");
  if (!order) notFound();

  const copy = headline(order, getCheckoutMode() === "orders-only");
  const { totals, delivery } = order;

  return (
    <Container className="pt-10 pb-24 md:pt-16 md:pb-32">
      <div className="mx-auto max-w-5xl">
        <p className="text-eyebrow text-muted-foreground">Order {order.number}</p>
        <h1 className="mt-5 font-display text-display-md">
          <Emphasis text={copy.title} />
        </h1>
        <p className="mt-6 max-w-xl text-lead text-muted-foreground">{copy.body}</p>

        <div className="mt-14 grid gap-y-14 border-t pt-10 md:grid-cols-12 md:gap-x-10 md:pt-12">
          <section aria-labelledby="order-pieces-heading" className="md:col-span-7">
            <h2 id="order-pieces-heading" className="text-label">
              Your pieces
            </h2>
            <ul className="mt-2 [&>li+li]:border-t">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-4 py-5">
                  <div className="w-16 shrink-0">
                    {item.imageUrl ? (
                      <MediaImage
                        image={{ src: item.imageUrl, width: 800, height: 1000, alt: "", color: "#ece8df" }}
                        ratio="4/5"
                        sizes="64px"
                        quality={60}
                      />
                    ) : (
                      <div aria-hidden="true" className="aspect-4/5 bg-surface" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium">
                      <Link href={item.href} className="link-underline">
                        {item.name}
                      </Link>
                    </p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {item.colorName} · {item.sizeLabel} · Qty {item.quantity}
                    </p>
                  </div>
                  <Price amount={item.lineTotal} className="shrink-0 text-body-sm" />
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-3 border-t pt-6 text-body-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>
                  <Price amount={totals.subtotal} />
                </dd>
              </div>
              {totals.discountTotal > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                  <dd className="tabular-nums">−{formatPrice(totals.discountTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{delivery.method === "pickup" ? "Collection" : "Delivery"}</dt>
                <dd>{totals.shippingTotal === 0 ? "Free" : <Price amount={totals.shippingTotal} />}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t pt-4">
                <dt className="text-label">Total</dt>
                <dd className="text-lead font-medium">
                  <Price amount={totals.total} />
                </dd>
              </div>
            </dl>
          </section>

          <div className="space-y-10 md:col-span-5">
            <section aria-labelledby="order-delivery-heading">
              <h2 id="order-delivery-heading" className="text-label">
                {delivery.method === "pickup" ? "Collection" : "Delivery"}
              </h2>
              <p className="mt-4 text-body-sm font-medium">{delivery.label}</p>
              {delivery.estimate ? <p className="text-body-sm text-muted-foreground">{delivery.estimate}</p> : null}
              <address className="mt-3 text-body-sm not-italic text-muted-foreground">
                {delivery.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
              {delivery.notes ? <p className="mt-3 text-caption text-muted-foreground">Note: {delivery.notes}</p> : null}
            </section>

            <section aria-labelledby="order-contact-heading">
              <h2 id="order-contact-heading" className="text-label">
                Contact
              </h2>
              <p className="mt-4 text-body-sm">{order.customerName}</p>
              <p className="text-body-sm text-muted-foreground">{order.email}</p>
              <p className="text-body-sm text-muted-foreground">{formatNigerianPhone(order.phone)}</p>
            </section>

            <section aria-labelledby="order-help-heading" className="border-t pt-8">
              <h2 id="order-help-heading" className="text-label">
                Need help?
              </h2>
              <p className="mt-4 text-body-sm text-muted-foreground">
                Email{" "}
                <a href={`mailto:${siteConfig.contact.email}`} className="link-underline-static text-foreground">
                  {siteConfig.contact.email}
                </a>{" "}
                or call {siteConfig.contact.phone}, quoting {order.number}. {siteConfig.contact.hours}.
              </p>
            </section>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-4 border-t pt-10">
          <Button asChild arrow>
            <Link href="/shop">Continue shopping</Link>
          </Button>
          <p className="text-caption text-muted-foreground">Keep this page&rsquo;s link to check on your order later.</p>
        </div>
      </div>
    </Container>
  );
}
