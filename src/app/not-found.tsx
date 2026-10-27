import type { Metadata } from "next";

import { NotFoundView } from "@/components/feedback/not-found-view";
import { StorefrontFrame } from "@/components/layout/storefront-frame";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * URLs that match no route at all. This one renders outside the (store) layout,
 * so it brings the storefront frame with it — a visitor who mistypes an address
 * still lands somewhere they can shop from, never in a bare page.
 */
export default function NotFound() {
  return (
    <StorefrontFrame>
      <NotFoundView />
    </StorefrontFrame>
  );
}
