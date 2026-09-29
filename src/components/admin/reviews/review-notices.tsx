import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/*
 * What the reviews page says when there's nothing to list, or the list can't be
 * read, and the note that product pages don't show reviews yet.
 */

/** The reviews couldn't be read: no database configured, or it didn't answer. */
export function ReviewsUnavailable({ reason }: { reason: "not_configured" | "failed" }) {
  return reason === "not_configured" ? (
    <AdminEmptyState
      as="h2"
      title="The database isn’t connected"
      body={
        <>
          Reviews are kept in the store’s database, which this copy of the site can’t reach. Check the
          database on the{" "}
          <Link href="/admin/settings" className="text-foreground underline underline-offset-4">
            Settings page
          </Link>
          .
        </>
      }
    />
  ) : (
    <AdminEmptyState
      as="h2"
      title="The reviews didn’t load"
      body="We couldn’t read the reviews just now. Refresh the page to try again. Nothing has been changed."
    />
  );
}

/**
 * Until product pages show reviews (a later update), approving one changes
 * nothing customers can see yet — say so, so the owner isn't left wondering.
 */
export function StorefrontReviewsNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "border-l-2 border-border-strong py-1 pl-3 text-body-sm text-muted-foreground",
        className,
      )}
    >
      Product pages don’t show reviews yet — that’s coming in a later update. Anything you approve now will be
      ready to appear then.
    </p>
  );
}
