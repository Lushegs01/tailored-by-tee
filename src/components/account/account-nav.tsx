"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/account/sign-out-button";
import { cn } from "@/lib/utils";

interface AccountNavLink {
  label: string;
  href: string;
}

/** Wishlist lives outside the account frame (guests have one too) but belongs with the rest. */
const ACCOUNT_LINKS: readonly AccountNavLink[] = [
  { label: "Overview", href: "/account" },
  { label: "Orders", href: "/account/orders" },
  { label: "Addresses", href: "/account/addresses" },
  { label: "Wishlist", href: "/wishlist" },
  { label: "Profile", href: "/account/profile" },
];

/**
 * "page" on the destination itself; "true" on a section's own sub-pages, so an
 * order at /account/orders/<number> still marks Orders. Overview is the frame's
 * root, so it only counts on /account exactly.
 */
function currentState(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (href !== "/account" && pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}

/** Hover draws the underline; the current destination keeps it. */
const underline =
  "link-underline pb-0.5 group-hover/account:bg-size-[100%_1px] group-aria-[current=page]/account:bg-size-[100%_1px] group-aria-[current=true]/account:bg-size-[100%_1px]";

/**
 * Account navigation. Below lg: a swipeable row of tabs under the greeting
 * (scrolling inside its own box, never the page). From lg: a quiet rail beside
 * the content, with sign-out beneath it.
 */
export function AccountNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  // In the scrolling row, bring the current tab into view (Profile sits past the edge at 375px)
  // by moving the row only — scrollIntoView could also jump the page.
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const item = list.querySelector("[aria-current]")?.closest("li");
    if (!item) return;
    const inset = Number.parseFloat(getComputedStyle(list).paddingLeft) || 0;
    const start = item.offsetLeft - inset;
    const end = item.offsetLeft + item.offsetWidth + inset - list.clientWidth;
    if (list.scrollLeft > start) list.scrollLeft = start;
    else if (list.scrollLeft < end) list.scrollLeft = end;
  }, [pathname]);

  return (
    <nav aria-label="Account" className={className}>
      {/* `relative` makes the list the offsetParent its items measure against. py leaves room for focus outlines the scroller would clip. */}
      <ul
        ref={listRef}
        className={cn(
          "relative -mx-(--gutter) flex snap-x gap-x-7 overflow-x-auto scroll-px-(--gutter) border-b px-(--gutter) py-1.5 scrollbar-none",
          "lg:mx-0 lg:snap-none lg:flex-col lg:overflow-visible lg:border-t lg:border-b-0 lg:px-0 lg:pt-3 lg:pb-0",
        )}
      >
        {ACCOUNT_LINKS.map((link) => (
          <li key={link.href} className="shrink-0 snap-start">
            <Link
              href={link.href}
              aria-current={currentState(pathname, link.href)}
              className={cn(
                "group/account inline-flex min-h-11 items-center whitespace-nowrap text-body-sm text-muted-foreground",
                "transition-colors duration-300 ease-editorial hover:text-foreground",
                "aria-[current=page]:text-foreground aria-[current=true]:text-foreground lg:min-h-10",
              )}
            >
              <span className={underline}>{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-5 hidden border-t pt-3 lg:block">
        <SignOutButton />
      </div>
    </nav>
  );
}
