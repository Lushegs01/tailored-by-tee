import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import type { MediaAsset } from "@/lib/media/types";

/*
 * Route metadata in one shape. Next merges metadata shallowly, so a page that sets
 * `openGraph` replaces the root layout's entirely — this helper always fills in
 * the shared fields (site name, locale, type) alongside the page's own.
 */

export interface PageMetadataInput {
  /** Page title; the root layout's template appends the brand. */
  title: string;
  description: string;
  /** Canonical path, e.g. "/shop/shirts". */
  path: string;
  image?: MediaAsset | null;
  /** Keep the page out of search indexes (filtered listings, search results). */
  noindex?: boolean;
  type?: "website" | "article";
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  noindex = false,
  type = "website",
}: PageMetadataInput): Metadata {
  const socialTitle = `${title} — ${siteConfig.name}`;
  const images = image ? [{ url: image.src, width: image.width, height: image.height, alt: image.alt }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type,
      siteName: siteConfig.name,
      locale: "en_NG",
      url: path,
      title: socialTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: image ? [image.src] : undefined,
    },
  };
}
