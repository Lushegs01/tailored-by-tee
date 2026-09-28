import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/*
 * What the customers pages say when they can't read anything, and the standing
 * notes about what the figures mean. No hooks, so server components render them
 * directly.
 */

const SETTINGS_SERVICES = "/admin/settings#services";

export type CustomerLoadFailure = "not_configured" | "needs_migration" | "unavailable";

const FAILURES: Record<CustomerLoadFailure, { title: string; body: string }> = {
  not_configured: {
    title: "The database isn’t connected",
    body: "Customers, their orders and their accounts are all kept in the database. Once it’s connected, they appear here.",
  },
  needs_migration: {
    title: "The database needs an update",
    body: "This page reads information the database doesn’t have yet. Ask your developer to run npm run db:deploy, then reload.",
  },
  unavailable: {
    title: "Couldn’t load customers",
    body: "Something went wrong reading the database. Reload the page in a moment; if it keeps happening, tell your developer.",
  },
};

/** A whole page or section that couldn't be read, in place of the missing content. */
export function CustomersUnavailable({
  reason,
  as = "h2",
  className,
}: {
  reason: CustomerLoadFailure;
  as?: "h2" | "h3";
  className?: string;
}) {
  const failure = FAILURES[reason];
  return (
    <div className={cn("border bg-background-raised", className)}>
      <AdminEmptyState
        as={as}
        title={failure.title}
        body={failure.body}
        action={
          reason === "not_configured" ? (
            <Link href={SETTINGS_SERVICES} className="text-body-sm">
              <span className="link-underline-static pb-0.5">See connected services</span>
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}

/** A quiet sentence under a figure or section, e.g. what "Total spent" counts. */
export function CustomerNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-caption text-muted-foreground", className)}>{children}</p>;
}
