"use client";

import { CartProvider } from "@/components/cart/cart-provider";
import { MotionProvider } from "@/components/motion/motion-provider";
import { SearchProvider } from "@/components/search/search-provider";
import { WishlistProvider } from "@/components/wishlist/wishlist-provider";

/** Client-side state that spans the whole storefront. Server components pass through as children. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <WishlistProvider>
        <CartProvider>
          <SearchProvider>{children}</SearchProvider>
        </CartProvider>
      </WishlistProvider>
    </MotionProvider>
  );
}
