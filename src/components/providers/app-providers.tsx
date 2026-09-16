"use client";

import { AccountProvider } from "@/components/account/account-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { MotionProvider } from "@/components/motion/motion-provider";
import { SearchProvider } from "@/components/search/search-provider";
import { WishlistProvider } from "@/components/wishlist/wishlist-provider";

/**
 * Client-side state that spans the whole storefront. Server components pass
 * through as children. `accounts` is configuration (lib/auth/config), read by the
 * static root layout — never a visitor's session.
 */
export function AppProviders({ accounts, children }: { accounts: boolean; children: React.ReactNode }) {
  return (
    <AccountProvider enabled={accounts}>
      <MotionProvider>
        <WishlistProvider>
          <CartProvider>
            <SearchProvider>{children}</SearchProvider>
          </CartProvider>
        </WishlistProvider>
      </MotionProvider>
    </AccountProvider>
  );
}
