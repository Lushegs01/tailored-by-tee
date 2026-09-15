"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAccount } from "@/components/account/use-account";
import { useCart } from "@/components/cart/cart-provider";
import { useHasMounted } from "@/components/hooks/use-has-mounted";
import { AccountIcon, BagIcon, HeartIcon, SearchIcon } from "@/components/icons";
import { useSearch } from "@/components/search/search-provider";
import { IconButton } from "@/components/ui/icon-button";
import { useWishlist } from "@/components/wishlist/wishlist-provider";
import { cn } from "@/lib/utils";

function countLabel(noun: string, count: number) {
  if (count === 0) return noun;
  return `${noun}, ${count} ${count === 1 ? "item" : "items"}`;
}

/** An icon with its count beside it (bag, wishlist). */
const countedControl =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 text-current transition-opacity duration-300 ease-editorial hover:opacity-60";

/**
 * Search, account, wishlist and bag. Colours inherit from the header so the same
 * controls read in paper over photography and in ink on the solid header.
 *
 * Below lg only search and bag show; the menu drawer carries account and
 * wishlist, which keeps the phone header to one control each side of the wordmark.
 *
 * Signed-in state comes from useAccount() after the page loads — never from the
 * server — so every storefront page stays static.
 */
export function HeaderActions({ className }: { className?: string }) {
  const pathname = usePathname();
  const search = useSearch();
  const cart = useCart();
  const wishlist = useWishlist();
  const account = useAccount();
  // The bag and wishlist hydrate from storage; showing counts only after mount keeps SSR and client in step.
  const mounted = useHasMounted();
  const bagCount = mounted ? cart.itemCount : 0;
  const wishlistCount = mounted ? wishlist.count : 0;

  // "loading" renders exactly as on the server; the link and label settle once the session is known.
  const signedOut = account.status === "signed-out";
  const accountHref = signedOut ? "/account/sign-in" : "/account";

  return (
    <div className={cn("flex items-center", className)}>
      <IconButton label="Search" aria-haspopup="dialog" onClick={search.open}>
        <SearchIcon />
      </IconButton>

      <IconButton label={signedOut ? "Sign in" : "Your account"} asChild className="hidden lg:inline-flex">
        <Link href={accountHref} aria-current={pathname === accountHref ? "page" : undefined}>
          <AccountIcon />
          {/* Positioned, so it appears without moving anything. Shown only once the session is known. */}
          {account.status === "signed-in" ? (
            <span aria-hidden="true" className="absolute top-2.5 right-2.5 size-1.5 bg-current" />
          ) : null}
        </Link>
      </IconButton>

      <Link
        href="/wishlist"
        aria-label={countLabel("Wishlist", wishlistCount)}
        aria-current={pathname === "/wishlist" ? "page" : undefined}
        className={cn(countedControl, "hidden lg:inline-flex")}
      >
        <HeartIcon className="text-[1.375rem]" />
        {wishlistCount > 0 ? (
          <span aria-hidden="true" className="min-w-[1ch] text-caption leading-none tabular-nums">
            {wishlistCount}
          </span>
        ) : null}
      </Link>

      <button
        type="button"
        aria-label={countLabel("Bag", bagCount)}
        aria-haspopup="dialog"
        onClick={cart.open}
        className={countedControl}
      >
        <BagIcon className="text-[1.375rem]" />
        {bagCount > 0 ? (
          <span aria-hidden="true" className="min-w-[1ch] text-caption leading-none tabular-nums">
            {bagCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
