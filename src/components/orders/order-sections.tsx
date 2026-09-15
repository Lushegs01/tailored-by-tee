import { siteConfig } from "@/config/site";
import { formatNigerianPhone } from "@/lib/commerce/phone";
import type { OrderView } from "@/lib/orders/types";

/** Where the order is going (or where to collect it), with the promised estimate and any note. */
export function OrderDelivery({ delivery }: { delivery: OrderView["delivery"] }) {
  return (
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
  );
}

/** The name, email and phone the order was placed with. */
export function OrderContact({ order }: { order: Pick<OrderView, "customerName" | "email" | "phone"> }) {
  return (
    <section aria-labelledby="order-contact-heading">
      <h2 id="order-contact-heading" className="text-label">
        Contact
      </h2>
      <p className="mt-4 text-body-sm">{order.customerName}</p>
      <p className="text-body-sm break-words text-muted-foreground">{order.email}</p>
      <p className="text-body-sm text-muted-foreground">{formatNigerianPhone(order.phone)}</p>
    </section>
  );
}

/** How to reach the studio about this order. */
export function OrderHelp({ orderNumber }: { orderNumber: string }) {
  return (
    <section aria-labelledby="order-help-heading" className="border-t pt-8">
      <h2 id="order-help-heading" className="text-label">
        Need help?
      </h2>
      <p className="mt-4 text-body-sm text-muted-foreground">
        Email{" "}
        <a href={`mailto:${siteConfig.contact.email}`} className="link-underline-static text-foreground">
          {siteConfig.contact.email}
        </a>{" "}
        or call {siteConfig.contact.phone}, quoting {orderNumber}. {siteConfig.contact.hours}.
      </p>
    </section>
  );
}
