"use client";

import { useState } from "react";
import Link from "next/link";
import { Accordion } from "radix-ui";
import * as m from "motion/react-m";

import { PlusIcon } from "@/components/icons";
import { Sheet } from "@/components/ui/sheet";
import { siteConfig, type MainNavItem } from "@/config/site";
import { DURATION, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { DRAWER_SECONDARY_LINKS, SHOP_HIGHLIGHTS, isCurrentPage } from "./header-config";
import type { HeaderNavData } from "./types";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: HeaderNavData;
  pathname: string;
}

/** Highlights not already in the main list (New Arrivals is), shown under the categories. */
const extraHighlights = SHOP_HIGHLIGHTS.filter(
  (link) => !siteConfig.mainNav.some((item) => item.href === link.href),
);

const displayLink = "flex min-h-14 w-full items-center font-display text-display-sm aria-[current=page]:italic";
const rowLink =
  "flex min-h-11 items-baseline gap-2 py-2.5 text-body aria-[current=page]:underline aria-[current=page]:decoration-1 aria-[current=page]:underline-offset-[6px]";

function current(pathname: string, href: string) {
  return isCurrentPage(pathname, href) ? ("page" as const) : undefined;
}

/**
 * Drawer navigation (< lg). Main destinations are set large in the serif; Shop and
 * Collections unfold in place. Any link closes the drawer straight away — also
 * when it points at the page already open, where no route change would.
 */
export function MobileNav({ open, onOpenChange, nav, pathname }: MobileNavProps) {
  const [section, setSection] = useState("");

  const closeOnLink = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("a")) onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title="Menu"
      bodyClassName="px-6 pb-12 pt-6"
      footer={<DrawerFooter />}
    >
      <nav aria-label="Main" onClick={closeOnLink}>
        <Accordion.Root type="single" collapsible value={section} onValueChange={setSection}>
          <ul>
            {siteConfig.mainNav.map((item) => (
              <li key={item.href} className="border-b last:border-b-0">
                {item.panel ? (
                  <PanelSection item={item} open={section === item.panel} nav={nav} pathname={pathname} />
                ) : (
                  <Link href={item.href} aria-current={current(pathname, item.href)} className={displayLink}>
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Accordion.Root>

        <ul className="mt-10 flex flex-col">
          {DRAWER_SECONDARY_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current(pathname, link.href)}
                className="flex min-h-11 items-center text-label aria-[current=page]:underline aria-[current=page]:underline-offset-[6px]"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Sheet>
  );
}

interface PanelSectionProps {
  item: MainNavItem & { panel: NonNullable<MainNavItem["panel"]> };
  open: boolean;
  nav: HeaderNavData;
  pathname: string;
}

function PanelSection({ item, open, nav, pathname }: PanelSectionProps) {
  return (
    <Accordion.Item value={item.panel}>
      <Accordion.Header>
        <Accordion.Trigger className={cn(displayLink, "group/trigger justify-between gap-6 text-left")}>
          {item.label}
          <PlusIcon
            className="shrink-0 text-lg transition-transform duration-500 ease-editorial group-data-[state=open]/trigger:rotate-45"
          />
        </Accordion.Trigger>
      </Accordion.Header>

      {/* Force-mounted so the height can ease closed; visibility then removes it from focus and the a11y tree. */}
      <Accordion.Content forceMount asChild>
        <m.div
          initial={false}
          animate={
            open
              ? { height: "auto", opacity: 1, visibility: "visible" }
              : { height: 0, opacity: 0, transitionEnd: { visibility: "hidden" } }
          }
          transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
          className="overflow-hidden"
        >
          <div className="pb-6 pt-1">
            {item.panel === "shop" ? (
              <ShopSection nav={nav} pathname={pathname} />
            ) : (
              <CollectionsSection nav={nav} pathname={pathname} />
            )}
          </div>
        </m.div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

function ShopSection({ nav, pathname }: { nav: HeaderNavData; pathname: string }) {
  return (
    <>
      <ul>
        <li>
          <Link href="/shop" aria-current={current(pathname, "/shop")} className={rowLink}>
            Shop all
          </Link>
        </li>
        {nav.categories.map((category) => (
          <li key={category.slug}>
            <Link href={category.href} aria-current={current(pathname, category.href)} className={rowLink}>
              {category.name}
              <span className="text-micro tabular-nums text-muted-foreground">
                {category.productCount}
                <span className="sr-only"> {category.productCount === 1 ? "piece" : "pieces"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {extraHighlights.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-x-8">
          {extraHighlights.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-11 items-center text-label">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function CollectionsSection({ nav, pathname }: { nav: HeaderNavData; pathname: string }) {
  return (
    <ul>
      {nav.collections.map((collection) => (
        <li key={collection.slug}>
          <Link
            href={collection.href}
            aria-current={current(pathname, collection.href)}
            className={cn(rowLink, "flex-wrap gap-x-3 gap-y-0")}
          >
            {collection.name}
            {collection.season ? (
              <span className="text-micro text-muted-foreground">{collection.season}</span>
            ) : null}
          </Link>
        </li>
      ))}
      <li>
        <Link href="/collections" aria-current={current(pathname, "/collections")} className={rowLink}>
          View all collections
        </Link>
      </li>
    </ul>
  );
}

function DrawerFooter() {
  const { contact, social } = siteConfig;

  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <a href={`mailto:${contact.email}`} className="inline-flex min-h-11 items-center self-start text-body-sm">
        <span className="link-underline-static pb-0.5">{contact.email}</span>
      </a>
      <ul className="flex flex-wrap gap-x-7">
        {social.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center text-label text-muted-foreground transition-colors duration-300 hover:text-foreground"
            >
              {link.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
