import type { MainNavItem, NavLink } from "@/config/site";

/**
 * Routes that open on a full-bleed photograph. There the header is fixed and
 * transparent (paper type over the image) until scrolled; everywhere else it is
 * sticky, solid and in normal flow. Pages listed here must supply their own top
 * scrim for legibility.
 */
export const OVERLAY_ROUTES: readonly string[] = ["/"];

/** Scroll distance (px) after which an overlay header turns solid and the announcement tucks away. */
export const HEADER_SOLID_AFTER = 80;

/** Scroll distance (px) after which scrolling down hides the header. */
export const HEADER_HIDE_AFTER = 400;

/** Movements smaller than this (px) are ignored, so trackpad jitter never toggles the header. */
export const HEADER_SCROLL_TOLERANCE = 8;

/** Curated entry points listed beside the categories in the Shop panel. */
export const SHOP_HIGHLIGHTS: NavLink[] = [
  { label: "New arrivals", href: "/shop/new-arrivals" },
  { label: "Best sellers", href: "/shop?sort=featured" },
  { label: "Sale", href: "/shop/sale" },
];

/** Quieter links set in small caps beneath the main list in the mobile drawer. */
export const DRAWER_SECONDARY_LINKS: NavLink[] = [
  { label: "Account", href: "/account" },
  { label: "Wishlist", href: "/wishlist" },
  { label: "Contact", href: "/contact" },
  { label: "Shipping & returns", href: "/shipping" },
];

export function isOverlayRoute(pathname: string) {
  return OVERLAY_ROUTES.includes(pathname);
}

/** True when `pathname` is exactly `href`. Links carrying a query string never count as current. */
export function isCurrentPage(pathname: string, href: string) {
  return !href.includes("?") && pathname === href;
}

/** True when `pathname` is `href` or sits beneath it. */
function isWithin(pathname: string, href: string) {
  const path = href.split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * The most specific main-nav item containing the current route, so
 * /shop/new-arrivals marks "New Arrivals" rather than "Shop".
 */
export function findActiveNavItem(pathname: string, items: readonly MainNavItem[]) {
  let match: MainNavItem | null = null;
  for (const item of items) {
    if (isWithin(pathname, item.href) && (!match || item.href.length > match.href.length)) {
      match = item;
    }
  }
  return match;
}
