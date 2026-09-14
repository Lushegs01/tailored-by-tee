import type { Metadata } from "next";

import { CartPageView } from "@/components/cart/cart-page";
import { Container } from "@/components/ui/container";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Your bag",
  description: "Review the pieces in your bag before checkout.",
  path: "/cart",
  noindex: true,
});

export default function CartPage() {
  return (
    <Container className="pt-8 pb-24 md:pt-12 md:pb-32">
      <h1 className="font-display text-display-sm">Your bag</h1>
      <CartPageView className="mt-10 md:mt-14" />
    </Container>
  );
}
