/**
 * Brand & storefront configuration.
 *
 * This is the single place to rename the brand, change contact details or edit
 * navigation. Everything visible in the header, footer and metadata reads from here.
 * (Admin-editable content moves to the database in Phase 8.)
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface MainNavItem extends NavLink {
  /** Opens a desktop panel listing categories or collections. */
  panel?: "shop" | "collections";
}

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export interface SiteConfig {
  name: string;
  /** Wordmark lockup: primary set in tracked sans, secondary in italic serif. */
  wordmark: { primary: string; secondary: string };
  tagline: string;
  description: string;
  url: string;
  locale: string;
  currency: "NGN";
  location: string;
  contact: { email: string; phone: string; hours: string; address: string };
  commerce: {
    /** Integer kobo. */
    freeDeliveryThreshold: number;
    maxQuantityPerLine: number;
    defaultLowStockThreshold: number;
  };
  announcement: { message: string; href?: string; linkLabel?: string } | null;
  mainNav: MainNavItem[];
  footer: { columns: FooterColumn[]; legal: NavLink[] };
  social: NavLink[];
}

export const siteConfig = {
  name: "Tailored by Tee",
  wordmark: { primary: "Tailored", secondary: "by Tee" },
  tagline: "Cut with intent. Worn with ease.",
  description:
    "Contemporary clothing from a Lagos studio — considered silhouettes, honest cloth and precise tailoring, made for everyday wear.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "en-NG",
  currency: "NGN",
  location: "Lagos, Nigeria",
  // Placeholder contact details — replace before launch.
  contact: {
    email: "studio@tailoredbytee.com",
    phone: "+234 800 000 0000",
    hours: "Monday to Saturday, 9:00–18:00 WAT",
    address: "Studio 4, Admiralty Way, Lekki Phase 1, Lagos",
  },
  commerce: {
    freeDeliveryThreshold: 150_000_00,
    maxQuantityPerLine: 10,
    defaultLowStockThreshold: 3,
  },
  announcement: {
    message: "Complimentary delivery in Lagos on orders over ₦150,000",
    href: "/shipping",
    linkLabel: "Delivery details",
  },
  mainNav: [
    { label: "New In", href: "/shop/new-arrivals" },
    { label: "Shop", href: "/shop", panel: "shop" },
    { label: "Collections", href: "/collections", panel: "collections" },
    { label: "About", href: "/about" },
  ],
  footer: {
    columns: [
      {
        title: "Shop",
        links: [
          { label: "New Arrivals", href: "/shop/new-arrivals" },
          { label: "All Products", href: "/shop" },
          { label: "Collections", href: "/collections" },
          { label: "Sale", href: "/shop/sale" },
        ],
      },
      {
        title: "Client Services",
        links: [
          { label: "Contact", href: "/contact" },
          { label: "Shipping", href: "/shipping" },
          { label: "Returns", href: "/returns" },
          { label: "Size Guide", href: "/size-guide" },
        ],
      },
      {
        title: "About",
        links: [
          { label: "Our Story", href: "/about" },
          // Points at the homepage newsletter band until a Journal page exists.
          { label: "Journal", href: "/#journal" },
          { label: "Stockists", href: "/stockists" },
        ],
      },
    ],
    legal: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
  social: [
    { label: "Instagram", href: "https://www.instagram.com/" },
    { label: "TikTok", href: "https://www.tiktok.com/" },
    { label: "Facebook", href: "https://www.facebook.com/" },
  ],
} satisfies SiteConfig;
