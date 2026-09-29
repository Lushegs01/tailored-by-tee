import type { Metadata } from "next";

import { NotFoundView } from "@/components/feedback/not-found-view";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/** notFound() from any storefront page — inside the site's own frame. */
export default function StorefrontNotFound() {
  return <NotFoundView />;
}
