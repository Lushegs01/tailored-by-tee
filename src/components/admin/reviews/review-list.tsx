import { formatNumber } from "@/lib/admin/format";
import type { AdminReviewRow } from "@/lib/admin/reviews";

import { ReviewBulkBar } from "./review-bulk-bar";
import { ReviewCard, toReviewItem } from "./review-card";
import { ReviewModerationProvider } from "./review-moderation-provider";
import { REVIEW_LIST_HEADING_ID, type ReviewTab } from "./review-rules";
import { ReviewSelectAll } from "./review-select";

/** "3 waiting for approval", "12 published", "16 reviews". */
function listHeading(tab: ReviewTab, total: number): string {
  const count = formatNumber(total);
  switch (tab) {
    case "PENDING":
      return `${count} waiting for approval`;
    case "APPROVED":
      return `${count} published`;
    case "REJECTED":
      return `${count} rejected`;
    default:
      return `${count} ${total === 1 ? "review" : "reviews"}`;
  }
}

/**
 * One page of reviews as cards, with "Select all on this page" above them and
 * the bulk bar below (sticking to the screen's bottom edge while reviews are
 * ticked). The list's heading is where focus returns when the review or bar it
 * was on goes away.
 */
export function ReviewList({
  rows,
  tab,
  total,
  currentAdminId,
  now,
}: {
  rows: readonly AdminReviewRow[];
  tab: ReviewTab;
  total: number;
  currentAdminId: string;
  now: Date;
}) {
  const items = rows.map(toReviewItem);

  return (
    <ReviewModerationProvider items={items}>
      <section aria-labelledby={REVIEW_LIST_HEADING_ID} className="border bg-background-raised">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b px-4 py-1 md:px-5">
          <h2
            id={REVIEW_LIST_HEADING_ID}
            tabIndex={-1}
            className="py-2 text-body-sm font-medium tabular-nums outline-none focus-visible:underline focus-visible:underline-offset-4"
          >
            {listHeading(tab, total)}
          </h2>
          <ReviewSelectAll />
        </div>
        <ul className="divide-y">
          {rows.map((row) => (
            <ReviewCard key={row.id} row={row} currentAdminId={currentAdminId} now={now} />
          ))}
        </ul>
        <ReviewBulkBar />
      </section>
    </ReviewModerationProvider>
  );
}
