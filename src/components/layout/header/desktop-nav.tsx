"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavigationMenu } from "radix-ui";

import { siteConfig, type MainNavItem } from "@/config/site";

import { findActiveNavItem, isCurrentPage } from "./header-config";
import { CollectionsPanel, ShopPanel } from "./nav-panels";
import type { HeaderNavData } from "./types";

export type NavPanel = NonNullable<MainNavItem["panel"]>;

interface DesktopNavProps {
  nav: HeaderNavData;
  pathname: string;
  /** Open panel, or "" when closed. Controlled so the header can turn solid and stay in view. */
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/**
 * Shared look for top-level items. Full row height, so the pointer never crosses a
 * gap on its way down into a panel; underline drawn on hover, when open or current.
 */
const itemClass = "group/nav inline-flex h-(--header-height) items-center text-label text-current";
const underlineClass =
  "link-underline pb-1 group-hover/nav:bg-size-[100%_1px] group-data-active/nav:bg-size-[100%_1px] group-data-[state=open]/nav:bg-size-[100%_1px]";

/**
 * Centre navigation (lg+). Radix NavigationMenu supplies hover intent, click and
 * keyboard (arrows, Tab into the panel, Esc back to the trigger). Panels render
 * into a single full-width viewport pinned beneath the header.
 */
export function DesktopNav({ nav, pathname, value, onValueChange, className }: DesktopNavProps) {
  const active = findActiveNavItem(pathname, siteConfig.mainNav);

  return (
    <NavigationMenu.Root
      aria-label="Main"
      value={value}
      onValueChange={onValueChange}
      delayDuration={120}
      className={className}
    >
      <NavigationMenu.List className="flex items-center gap-x-9 xl:gap-x-12">
        {siteConfig.mainNav.map((item: MainNavItem) => {
          const isActive = active?.href === item.href;
          const ariaCurrent = isActive ? (isCurrentPage(pathname, item.href) ? "page" : "true") : undefined;

          return item.panel ? (
            <NavigationMenu.Item key={item.href} value={item.panel}>
              <PanelTrigger item={item} active={isActive} />
              <NavigationMenu.Content>
                {item.panel === "shop" ? (
                  <ShopPanel nav={nav} pathname={pathname} />
                ) : (
                  <CollectionsPanel nav={nav} pathname={pathname} />
                )}
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          ) : (
            <NavigationMenu.Item key={item.href}>
              <NavigationMenu.Link asChild active={isActive} aria-current={ariaCurrent}>
                <Link href={item.href} className={itemClass}>
                  <span className={underlineClass}>{item.label}</span>
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>

      {/* Positioned against the <header>: nothing between the two establishes a containing block. */}
      <NavigationMenu.Viewport className="absolute inset-x-0 top-full h-(--radix-navigation-menu-viewport-height) overflow-hidden border-b bg-background text-foreground transition-[height] duration-500 ease-editorial" />
    </NavigationMenu.Root>
  );
}

/**
 * Opens its panel on hover, keyboard or touch. A mouse click goes straight to the
 * section (/shop, /collections) — what a pointer user expects of a top-level label —
 * while the panel's "View all" link covers everyone else.
 */
function PanelTrigger({ item, active }: { item: MainNavItem; active: boolean }) {
  const router = useRouter();
  const pointerType = useRef<string | null>(null);

  return (
    <NavigationMenu.Trigger
      className={itemClass}
      data-active={active ? "" : undefined}
      aria-current={active ? "true" : undefined}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
      }}
      onClick={(event) => {
        const viaMouse = pointerType.current === "mouse" && event.detail > 0;
        pointerType.current = null;
        if (viaMouse && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          // Skips Radix's toggle; the route change closes the panel.
          event.preventDefault();
          router.push(item.href);
        }
      }}
    >
      <span className={underlineClass}>{item.label}</span>
    </NavigationMenu.Trigger>
  );
}
