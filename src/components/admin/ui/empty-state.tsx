import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminEmptyStateProps {
  /** Plain and specific: "No orders yet", "No products match these filters". */
  title: string;
  /** What it means or what to do next, in a sentence. */
  body?: ReactNode;
  /** The way forward: a link or button (at most one primary per view). */
  action?: ReactNode;
  /** h3 inside an AdminSection (default); h2 when it stands in for a section; h1 when it is the page (errors, 404). */
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
}

/**
 * Empty lists and "nothing matches" states in the admin area. Deliberately plainer
 * than the storefront's editorial EmptyState (feedback/empty-state.tsx), whose
 * display serif would shout inside a data table.
 */
export function AdminEmptyState({ title, body, action, as: Heading = "h3", className }: AdminEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center md:py-14", className)}>
      <Heading className="text-body font-medium">{title}</Heading>
      {body ? <div className="mt-2 max-w-md text-body-sm text-muted-foreground">{body}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">{action}</div> : null}
    </div>
  );
}
