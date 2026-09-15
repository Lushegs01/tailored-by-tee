import type { Metadata } from "next";
import { connection } from "next/server";

import { enabledSignInMethods } from "@/auth";
import type { CheckoutPrefill } from "@/components/checkout/checkout-prefill";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { deliveryPolicy } from "@/config/policies";
import { siteConfig } from "@/config/site";
import { listAddresses } from "@/lib/account/addresses";
import { getProfile } from "@/lib/account/profile";
import { getCurrentUser, signInPath, type CurrentUser } from "@/lib/auth/session";
import { getCheckoutMode, paymentsAreTest } from "@/lib/commerce/checkout-mode";
import { isDatabaseConfigured } from "@/lib/db";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Checkout",
  description: "Delivery details and secure payment.",
  path: "/checkout",
  noindex: true,
});

export default async function CheckoutPage() {
  // Rendered for each request, never prerendered or cached: a signed-in customer's
  // details go into this page. Reading the session cookie already opts the route in;
  // connection() keeps it so even when there is no database (and so no session) to ask.
  await connection();

  const user = await getCurrentUser();
  const prefill = user ? await accountPrefill(user) : undefined;
  const offerSignIn = !user && isDatabaseConfigured() && (enabledSignInMethods.google || enabledSignInMethods.email);

  const pickup = deliveryPolicy.pickup?.enabled
    ? { name: deliveryPolicy.pickup.name, estimate: deliveryPolicy.pickup.estimate, address: deliveryPolicy.pickup.address }
    : null;

  return (
    <Container className="pt-8 pb-24 md:pt-12 md:pb-32">
      <div className="mb-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 md:mb-14">
        <h1 className="font-display text-display-sm">Checkout</h1>
        {offerSignIn ? (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
            Have an account?
            <TextLink href={signInPath("/checkout")} variant="underline">
              Sign in
            </TextLink>
          </p>
        ) : null}
      </div>
      <CheckoutView
        mode={getCheckoutMode()}
        testPayments={paymentsAreTest()}
        reservationMinutes={siteConfig.commerce.reservationMinutes}
        pickup={pickup}
        deliveryFromFee={Math.min(...deliveryPolicy.zones.map((zone) => zone.fee))}
        supportEmail={siteConfig.contact.email}
        prefill={prefill}
      />
    </Container>
  );
}

/** The account's details for the form, scoped to the session's user. */
async function accountPrefill(user: CurrentUser): Promise<CheckoutPrefill> {
  try {
    const [profile, addresses] = await Promise.all([getProfile(user.id), listAddresses(user.id)]);
    return { email: user.email, fullName: profile?.name ?? user.name, phone: profile?.phone ?? null, addresses };
  } catch (error) {
    // Checkout never depends on the account: without it the customer types their details, as a guest would.
    console.error("[checkout] could not load account details", error instanceof Error ? error.message : error);
    return { email: user.email, fullName: user.name, phone: null, addresses: [] };
  }
}
