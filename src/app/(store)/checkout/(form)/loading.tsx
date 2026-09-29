import { CheckoutSkeleton } from "@/components/checkout/checkout-view";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Checkout's skeleton: the heading, then the same form-and-summary geometry the
 * page shows while it mounts, so nothing shifts when it arrives. Lives in the
 * (form) group so it covers only /checkout, never the order pages beneath it.
 * Fades in after a short delay (pure CSS via @starting-style).
 */
export default function CheckoutLoading() {
  return (
    <Container className="pt-8 pb-24 transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0 md:pt-12 md:pb-32">
      <div className="mb-10 md:mb-14" aria-hidden="true">
        <Skeleton className="h-9 w-40 md:h-11 md:w-52" />
      </div>
      <CheckoutSkeleton label="Loading checkout" />
    </Container>
  );
}
