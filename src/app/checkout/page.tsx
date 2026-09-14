import type { Metadata } from "next";

import { CheckoutView } from "@/components/checkout/checkout-view";
import { Container } from "@/components/ui/container";
import { deliveryPolicy } from "@/config/policies";
import { siteConfig } from "@/config/site";
import { getCheckoutMode, paymentsAreTest } from "@/lib/commerce/checkout-mode";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Checkout",
  description: "Delivery details and secure payment.",
  path: "/checkout",
  noindex: true,
});

export default function CheckoutPage() {
  const pickup = deliveryPolicy.pickup?.enabled
    ? { name: deliveryPolicy.pickup.name, estimate: deliveryPolicy.pickup.estimate, address: deliveryPolicy.pickup.address }
    : null;

  return (
    <Container className="pt-8 pb-24 md:pt-12 md:pb-32">
      <h1 className="mb-10 font-display text-display-sm md:mb-14">Checkout</h1>
      <CheckoutView
        mode={getCheckoutMode()}
        testPayments={paymentsAreTest()}
        reservationMinutes={siteConfig.commerce.reservationMinutes}
        pickup={pickup}
        deliveryFromFee={Math.min(...deliveryPolicy.zones.map((zone) => zone.fee))}
        supportEmail={siteConfig.contact.email}
      />
    </Container>
  );
}
