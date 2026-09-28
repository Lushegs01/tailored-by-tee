import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

/*
 * Page metadata for the admin area. Every admin page exports
 *
 *   export const metadata = adminMetadata("Orders");
 *   // or, in generateMetadata: return adminMetadata(`Order ${order.number}`);
 *
 * giving "Orders — Admin — Tailored by Tee" and noindex/nofollow. The title is
 * absolute on purpose: a layout's title.template does not apply to the page in
 * its own segment (/admin itself), so relying on it would title pages unevenly.
 */

export const ADMIN_TITLE_SUFFIX = `Admin — ${siteConfig.name}`;

export const ADMIN_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};

/** "Orders" → { title: { absolute: "Orders — Admin — Tailored by Tee" }, robots: noindex }. */
export function adminMetadata(title?: string): Metadata {
  return {
    title: { absolute: title ? `${title} — ${ADMIN_TITLE_SUFFIX}` : ADMIN_TITLE_SUFFIX },
    robots: ADMIN_ROBOTS,
  };
}
