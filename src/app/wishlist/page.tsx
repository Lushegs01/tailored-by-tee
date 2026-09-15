import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { WishlistView } from "@/components/wishlist/wishlist-view";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Wishlist",
    description: "The pieces you’ve saved for later.",
    path: "/wishlist",
  }),
  // Personal to each visitor, so kept out of search results entirely.
  robots: { index: false, follow: false },
};

/**
 * A static shell. The list itself is resolved in the browser — a guest's saved
 * pieces live in localStorage, and a signed-in list is fetched after the page
 * loads — so this page stays cacheable and never reads the session.
 */
export default function WishlistPage() {
  return (
    <Container className="pt-8 pb-24 md:pt-12 md:pb-32">
      <h1 className="font-display text-display-sm">Wishlist</h1>
      <WishlistView className="mt-10 md:mt-14" />
    </Container>
  );
}
