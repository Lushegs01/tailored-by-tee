import type { Metadata } from "next";

import { StorefrontFrame } from "@/components/layout/storefront-frame";
import { siteConfig } from "@/config/site";

/*
 * The storefront. Every shopper-facing route lives in this group, so the header,
 * footer, bag and search — and the brand's own metadata — wrap these pages and
 * only these pages. The admin area is a sibling with its own frame, and the
 * grouping folder's name never appears in a URL.
 */

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: "en_NG",
    url: "/",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
};

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontFrame>{children}</StorefrontFrame>;
}
