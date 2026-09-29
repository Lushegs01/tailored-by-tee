import Link from "next/link";

import { formatNumber } from "@/lib/admin/format";
import type { ListParams } from "@/lib/admin/pagination";
import { cn } from "@/lib/utils";

import { REVIEW_TABS, reviewTabHref, type ReviewTab, type ReviewTabCounts } from "./review-rules";

/**
 * Waiting for approval · Published · Rejected · All reviews — each with its count
 * under the current search and filters. Links (not ARIA tabs): each is its own
 * URL, keeping the search and filters. On phones the row scrolls sideways inside
 * its own strip rather than the page.
 */
export function ReviewTabs({
  params,
  current,
  counts,
  className,
}: {
  params: ListParams;
  current: ReviewTab;
  counts: ReviewTabCounts;
  className?: string;
}) {
  // `relative` makes the strip the containing block of its screen-reader-only text,
  // so that text scrolls (and is clipped) with the strip instead of widening the page.
  return (
    <nav
      aria-label="Reviews by status"
      className={cn("relative -mx-4 scrollbar-none overflow-x-auto border-b px-4 md:mx-0 md:px-0", className)}
    >
      <ul className="flex min-w-max gap-1">
        {REVIEW_TABS.map((tab) => {
          const count = counts[tab.value];
          const active = tab.value === current;
          const needsAttention = tab.value === "PENDING" && count > 0;
          return (
            <li key={tab.value}>
              <Link
                href={reviewTabHref(params, tab.value)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-3 text-body-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  "aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground",
                )}
              >
                {tab.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "min-w-5 border px-1 text-center text-caption tabular-nums",
                    needsAttention ? "border-accent-brand/60 text-accent-brand" : "border-border",
                  )}
                >
                  {formatNumber(count)}
                </span>
                <span className="sr-only">
                  , {formatNumber(count)} {count === 1 ? "review" : "reviews"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
