import type { Metadata } from "next";
import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/ui/empty-state";
import { adminMetadata } from "@/lib/admin/metadata";

export const metadata: Metadata = adminMetadata("Not found");

/**
 * For notFound() inside the admin area (an order, product or discount that
 * doesn't exist, or was deleted), rendered inside the admin shell. Visitors
 * without admin access never see this: the layout sends them the storefront 404.
 */
export default function AdminNotFound() {
  return (
    <div className="border bg-background-raised">
      <AdminEmptyState
        as="h1"
        title="We couldn’t find that"
        body="It may have been deleted, or the link may be out of date. Use the navigation to find what you need."
        action={
          <Link href="/admin" className="inline-flex min-h-10 items-center text-body-sm">
            <span className="link-underline-static pb-0.5">Go to overview</span>
          </Link>
        }
      />
    </div>
  );
}
