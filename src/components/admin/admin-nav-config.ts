/*
 * The admin area's navigation, in order. The shell (sidebar on large screens,
 * menu sheet on phones) renders exactly this list, so adding a section means
 * adding a line here — never editing the layout.
 */

/** Counts the shell can show beside a link (computed on the server in lib/admin/nav-counts). */
export type AdminNavCountKey = "ordersToFulfil" | "reviewsPending";

export type AdminNavCounts = Record<AdminNavCountKey, number>;

export interface AdminNavItem {
  label: string;
  href: string;
  /** Show this count beside the link when it's above zero. */
  count?: AdminNavCountKey;
  /** Screen-reader wording for the count, e.g. "orders to fulfil". */
  countLabel?: string;
}

export const ADMIN_HOME = "/admin";

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Orders", href: "/admin/orders", count: "ordersToFulfil", countLabel: "orders to fulfil" },
  { label: "Products", href: "/admin/products" },
  { label: "Inventory", href: "/admin/inventory" },
  { label: "Collections", href: "/admin/collections" },
  { label: "Categories", href: "/admin/categories" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Discounts", href: "/admin/discounts" },
  { label: "Reviews", href: "/admin/reviews", count: "reviewsPending", countLabel: "reviews waiting for approval" },
  { label: "Settings", href: "/admin/settings" },
];

/**
 * aria-current for a nav link: "page" on the section's own page, "true" on its
 * sub-pages (an order at /admin/orders/ORD-… still marks Orders). Overview is the
 * area's root, so it only counts on /admin exactly.
 */
export function adminNavCurrent(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (href !== ADMIN_HOME && pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
