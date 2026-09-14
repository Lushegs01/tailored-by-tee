"use client";

import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import * as m from "motion/react-m";

import { collectionMeta } from "@/components/collection/collection-meta";
import { ArrowRightIcon } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { MediaImage } from "@/components/ui/media-image";
import { DURATION, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { SHOP_HIGHLIGHTS, isCurrentPage } from "./header-config";
import type { HeaderNavData, NavCollection } from "./types";

/*
 * Contents of the two desktop dropdowns. They render inside NavigationMenu.Content,
 * so every link is a NavigationMenu.Link: selecting one closes the panel and the
 * menu's keyboard model (arrows, Tab, Esc) keeps working.
 */

interface PanelProps {
  nav: HeaderNavData;
  pathname: string;
}

/** Quiet fade and short rise; the frame around it never moves. */
function PanelMotion({ children }: { children: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
    >
      <Container className="grid grid-cols-12 gap-x-(--gutter) gap-y-10 pb-12 pt-10 xl:pb-14 xl:pt-12">
        {children}
      </Container>
    </m.div>
  );
}

function PanelLink({
  href,
  pathname,
  className,
  children,
}: {
  href: string;
  pathname: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <NavigationMenu.Link asChild active={isCurrentPage(pathname, href)}>
      <Link href={href} className={cn("group/panel-link", className)}>
        {children}
      </Link>
    </NavigationMenu.Link>
  );
}

function ViewAllLink({ href, pathname, children }: { href: string; pathname: string; children: string }) {
  return (
    <PanelLink href={href} pathname={pathname} className="inline-flex min-h-11 items-center gap-3 text-label">
      <span className="link-underline pb-1 group-hover/panel-link:bg-size-[100%_1px]">{children}</span>
      <ArrowRightIcon className="-mt-1 transition-transform duration-500 ease-editorial group-hover/panel-link:translate-x-1" />
    </PanelLink>
  );
}

function ColumnLabel({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mb-5 text-eyebrow text-muted-foreground">
      {children}
    </p>
  );
}

/** Underline that follows hover on the whole row and marks the current page. */
const rowUnderline =
  "link-underline pb-0.5 group-hover/panel-link:bg-size-[100%_1px] group-aria-[current=page]/panel-link:bg-size-[100%_1px]";

export function ShopPanel({ nav, pathname }: PanelProps) {
  const { categories, featured } = nav;

  return (
    <PanelMotion>
      <div className="col-span-5 xl:col-span-4">
        <ColumnLabel id="nav-shop-categories">Categories</ColumnLabel>
        {categories.length > 0 ? (
          <ul aria-labelledby="nav-shop-categories" className="grid grid-cols-2 gap-x-(--gutter)">
            {categories.map((category) => (
              <li key={category.slug}>
                <PanelLink
                  href={category.href}
                  pathname={pathname}
                  className="flex min-h-11 items-baseline gap-2 py-2.5 text-body"
                >
                  <span className={rowUnderline}>{category.name}</span>
                  <span className="text-micro tabular-nums text-muted-foreground">
                    {category.productCount}
                    <span className="sr-only"> {category.productCount === 1 ? "piece" : "pieces"}</span>
                  </span>
                </PanelLink>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6">
          <ViewAllLink href="/shop" pathname={pathname}>
            Shop all
          </ViewAllLink>
        </div>
      </div>

      <div className="col-span-3">
        <ColumnLabel id="nav-shop-highlights">Highlights</ColumnLabel>
        <ul aria-labelledby="nav-shop-highlights" className="flex flex-col gap-1">
          {SHOP_HIGHLIGHTS.map((link) => (
            <li key={link.href}>
              <PanelLink
                href={link.href}
                pathname={pathname}
                className="inline-flex min-h-11 items-center font-display text-display-xs"
              >
                <span className={rowUnderline}>{link.label}</span>
              </PanelLink>
            </li>
          ))}
        </ul>
      </div>

      {featured ? <FeaturedCard collection={featured} pathname={pathname} /> : null}
    </PanelMotion>
  );
}

/** Editorial card for the featured collection: wide photograph, caption beneath. */
function FeaturedCard({ collection, pathname }: { collection: NavCollection; pathname: string }) {
  const meta = collectionMeta(collection);

  return (
    <div className="col-span-4 col-start-9">
      <PanelLink href={collection.href} pathname={pathname} className="block">
        {collection.image ? (
          <div className="overflow-hidden">
            <MediaImage
              image={collection.image}
              ratio="3/2"
              sizes="(min-width: 1840px) 580px, 31vw"
              quality={60}
              alt=""
              imageClassName="transition-transform duration-[1200ms] ease-editorial group-hover/panel-link:scale-[1.03]"
            />
          </div>
        ) : null}
        <span className="mt-4 flex items-baseline justify-between gap-6">
          <span className="flex flex-col gap-1.5">
            {meta ? <span className="text-eyebrow text-muted-foreground">{meta}</span> : null}
            <span className="font-display text-display-xs">{collection.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3 text-label">
            <span className="link-underline pb-1 group-hover/panel-link:bg-size-[100%_1px]">Explore</span>
            <ArrowRightIcon className="-mt-1 transition-transform duration-500 ease-editorial group-hover/panel-link:translate-x-1" />
          </span>
        </span>
      </PanelLink>
    </div>
  );
}

export function CollectionsPanel({ nav, pathname }: PanelProps) {
  const { collections } = nav;

  return (
    <PanelMotion>
      <div className="col-span-12 flex items-end justify-between gap-8 2xl:col-span-3 2xl:flex-col 2xl:items-start">
        <div>
          <p className="text-eyebrow text-muted-foreground">Collections</p>
          <p className="mt-3 max-w-[22rem] text-body-sm text-muted-foreground">
            Seasonal chapters from the studio, alongside the pieces we keep on the rail all year.
          </p>
        </div>
        <ViewAllLink href="/collections" pathname={pathname}>
          View all collections
        </ViewAllLink>
      </div>

      <ul className="col-span-12 grid grid-cols-3 gap-x-(--gutter) gap-y-8 2xl:col-span-9">
        {collections.map((collection) => (
          <li key={collection.slug}>
            <CollectionCard collection={collection} pathname={pathname} />
          </li>
        ))}
      </ul>
    </PanelMotion>
  );
}

function CollectionCard({ collection, pathname }: { collection: NavCollection; pathname: string }) {
  const meta = collectionMeta(collection);

  return (
    <PanelLink
      href={collection.href}
      pathname={pathname}
      className="grid grid-cols-[6rem_1fr] items-start gap-5 xl:grid-cols-[7rem_1fr]"
    >
      <span className="block overflow-hidden bg-surface">
        {collection.image ? (
          <MediaImage
            image={collection.image}
            ratio="4/5"
            sizes="(min-width: 1280px) 112px, 96px"
            quality={60}
            alt=""
            imageClassName="transition-transform duration-[1200ms] ease-editorial group-hover/panel-link:scale-[1.04]"
          />
        ) : (
          <span aria-hidden="true" className="block aspect-4/5" />
        )}
      </span>
      <span className="flex flex-col gap-2 pt-1">
        {meta ? <span className="text-eyebrow text-muted-foreground">{meta}</span> : null}
        <span className="font-display text-display-xs">
          <span className={rowUnderline}>{collection.name}</span>
        </span>
        <span className="line-clamp-2 text-body-sm text-muted-foreground">{collection.summary}</span>
      </span>
    </PanelLink>
  );
}
