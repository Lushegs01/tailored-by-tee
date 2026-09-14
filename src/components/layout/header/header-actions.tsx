"use client";

import Link from "next/link";

import { useCart } from "@/components/cart/cart-provider";
import { useHasMounted } from "@/components/hooks/use-has-mounted";
import { AccountIcon, BagIcon, SearchIcon } from "@/components/icons";
import { useSearch } from "@/components/search/search-provider";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

function bagLabel(count: number) {
  if (count === 0) return "Bag";
  return `Bag, ${count} ${count === 1 ? "item" : "items"}`;
}

/**
 * Search, account and bag. Colours inherit from the header so the same controls
 * read in paper over photography and in ink on the solid header.
 */
export function HeaderActions({ className }: { className?: string }) {
  const search = useSearch();
  const cart = useCart();
  // The bag may hydrate from storage; showing the count only after mount keeps SSR and client in step.
  const mounted = useHasMounted();
  const count = mounted ? cart.itemCount : 0;

  return (
    <div className={cn("flex items-center", className)}>
      <IconButton label="Search" aria-haspopup="dialog" onClick={search.open}>
        <SearchIcon />
      </IconButton>

      <IconButton label="Account" asChild className="hidden lg:inline-flex">
        <Link href="/account">
          <AccountIcon />
        </Link>
      </IconButton>

      <button
        type="button"
        aria-label={bagLabel(count)}
        aria-haspopup="dialog"
        onClick={cart.open}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 text-current transition-opacity duration-300 ease-editorial hover:opacity-60"
      >
        <BagIcon className="text-[1.375rem]" />
        {count > 0 ? (
          <span aria-hidden="true" className="min-w-[1ch] text-caption leading-none tabular-nums">
            {count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
