import { homepageBlocks } from "@/config/homepage";
import { siteConfig, type NavLink, type SiteConfig } from "@/config/site";
import type { HomeBlock } from "@/lib/content/types";

import type { SlugKind } from "./slug-rules";

/*
 * Where the shop's fixed content — written in code, not in the admin — points at
 * a collection or category by its web address: the homepage (config/homepage.ts),
 * the main menu, footer and announcement bar (config/site.ts) and the "page not
 * found" page. Those places don't follow a renamed web address and aren't
 * updated when a collection is hidden or deleted, so the admin warns first.
 * Pure: the same answer on the server and in the browser.
 */

export interface ShopReference {
  /** Where it is, e.g. "Homepage — opening photograph". */
  place: string;
  /** What it is there, e.g. "“Explore the collection” button". */
  item: string;
  /**
   * "link": a link that would lead to "page not found".
   * "feature": a homepage section that quietly leaves this out (or disappears).
   */
  effect: "link" | "feature";
}

/**
 * The browse links on the "page not found" page (src/app/not-found.tsx keeps them
 * in a private constant). Keep in step with that file.
 */
export const NOT_FOUND_CATEGORY_LINKS: readonly NavLink[] = [
  { label: "Shirts", href: "/shop/shirts" },
  { label: "Trousers", href: "/shop/trousers" },
  { label: "Outerwear", href: "/shop/outerwear" },
  { label: "Knitwear", href: "/shop/knitwear" },
];

const PAGE_NOT_FOUND = "“Page not found” page";

function plain(text: string): string {
  return text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function blockPlace(block: HomeBlock): string {
  switch (block.type) {
    case "hero":
      return "Homepage — opening photograph";
    case "statement":
      return "Homepage — studio statement";
    case "productShelf":
      return `Homepage — “${plain(block.title)}” shelf`;
    case "splitStory":
      return `Homepage — “${plain(block.title)}” feature`;
    case "categoryIndex":
      return `Homepage — “${plain(block.title)}” category list`;
    case "collectionSpread":
      return `Homepage — “${plain(block.title)}” collection feature`;
    case "brandStory":
      return `Homepage — “${plain(block.title)}” feature`;
    case "newsletter":
      return "Homepage — newsletter";
  }
}

/** Whether `href` opens this collection or category (its page, or a shop filter for it). */
export function hrefPointsAt(href: string, kind: SlugKind, slug: string): boolean {
  let url: URL;
  try {
    url = new URL(href, "https://shop.invalid");
  } catch {
    return false;
  }
  if (url.origin !== "https://shop.invalid") return false;
  const path = url.pathname.replace(/\/+$/, "");
  if (kind === "collection") {
    if (path === `/collections/${slug}`) return true;
    return (path === "/shop" || path.startsWith("/shop/")) && url.searchParams.getAll("collection").includes(slug);
  }
  return path === `/shop/${slug}`;
}

function isNavLink(value: unknown): value is NavLink {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as NavLink).href === "string" &&
    typeof (value as NavLink).label === "string"
  );
}

/** Every NavLink inside a value (blocks nest them in ctas, items, captions…). */
function collectLinks(value: unknown, into: NavLink[] = []): NavLink[] {
  if (Array.isArray(value)) {
    for (const item of value) collectLinks(item, into);
  } else if (isNavLink(value)) {
    into.push(value);
  } else if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) collectLinks(child, into);
  }
  return into;
}

function linkReferences(place: string, links: readonly NavLink[], kind: SlugKind, slug: string): ShopReference[] {
  return links
    .filter((link) => hrefPointsAt(link.href, kind, slug))
    .map((link) => ({ place, item: `“${plain(link.label)}” link`, effect: "link" as const }));
}

/**
 * Every place in the shop's fixed content that points at this collection or
 * category. `blocks` and `site` default to the live configuration (overridable for tests).
 */
export function findShopReferences(
  kind: SlugKind,
  slug: string,
  sources: {
    blocks?: readonly HomeBlock[];
    site?: Pick<SiteConfig, "mainNav" | "footer" | "announcement">;
    notFoundLinks?: readonly NavLink[];
  } = {},
): ShopReference[] {
  if (!slug) return [];
  const blocks = sources.blocks ?? homepageBlocks;
  const site = sources.site ?? siteConfig;
  const notFoundLinks = sources.notFoundLinks ?? NOT_FOUND_CATEGORY_LINKS;
  const references: ShopReference[] = [];

  for (const block of blocks) {
    const place = blockPlace(block);

    if (kind === "collection" && block.type === "collectionSpread" && block.collectionSlug === slug) {
      references.push({ place, item: "Features this collection", effect: "feature" });
    }
    if (kind === "category" && block.type === "categoryIndex" && block.categories.includes(slug)) {
      references.push({ place, item: "Lists this category", effect: "feature" });
    }
    if (block.type === "productShelf") {
      const source = block.source;
      if ((source.kind === "collection" || source.kind === "category") && source.kind === kind && source.slug === slug) {
        references.push({ place, item: `Shows pieces from this ${kind}`, effect: "feature" });
      }
    }

    references.push(...linkReferences(place, collectLinks(block), kind, slug));
  }

  references.push(...linkReferences("Main menu", site.mainNav, kind, slug));
  for (const column of site.footer.columns) {
    references.push(...linkReferences(`Footer — “${column.title}” column`, column.links, kind, slug));
  }
  references.push(...linkReferences("Footer — small print", site.footer.legal, kind, slug));
  const announcement = site.announcement;
  if (announcement?.href && announcement.linkLabel) {
    references.push(
      ...linkReferences("Announcement bar", [{ label: announcement.linkLabel, href: announcement.href }], kind, slug),
    );
  }
  references.push(...linkReferences(PAGE_NOT_FOUND, notFoundLinks, kind, slug));

  return references;
}

/** "the homepage and the main menu" — the distinct places, for a one-line warning. */
export function describeReferencePlaces(references: readonly ShopReference[]): string {
  const places = [
    ...new Set(
      references.map((reference) =>
        reference.place.startsWith("Homepage")
          ? "the homepage"
          : reference.place.startsWith("Footer")
            ? "the footer"
            : reference.place === PAGE_NOT_FOUND
              ? "the “page not found” page"
              : `the ${reference.place.charAt(0).toLowerCase()}${reference.place.slice(1)}`,
      ),
    ),
  ];
  if (places.length <= 1) return places[0] ?? "";
  return `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
}
