import Link from "next/link";

import { MediaThumb } from "@/components/admin/media/media-thumb";
import { StatusBadge } from "@/components/admin/ui";
import { formatAdminDate, formatAdminDateTime, formatRelative } from "@/lib/admin/format";
import type { AdminReviewRow } from "@/lib/admin/reviews";
import { productStatusDisplay, reviewStatusDisplay } from "@/lib/admin/status";

import { ReviewActions } from "./review-actions";
import { ReviewBody } from "./review-body";
import type { ReviewItem } from "./review-moderation-provider";
import { ReviewRating } from "./review-rating";
import { isLongReviewBody, moderationByline, reviewElementId, reviewLabel } from "./review-rules";
import { ReviewSelectBox } from "./review-select";

/*
 * One review, as a card on every screen size: the product it's about, the rating
 * and what the customer wrote (in full), who wrote it and how we know them, its
 * status and moderation history, and its actions.
 *
 * md and up: tick box · the review · a side column (status, dates, actions).
 * Phones: the side column drops under the review.
 */

export function toReviewItem(row: AdminReviewRow): ReviewItem {
  return {
    id: row.id,
    status: row.status,
    isDemo: row.isDemo,
    label: reviewLabel(row.displayName, row.product.name),
  };
}

const smallLink =
  "text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground";

export function ReviewCard({
  row,
  currentAdminId,
  now,
}: {
  row: AdminReviewRow;
  currentAdminId: string;
  now: Date;
}) {
  const item = toReviewItem(row);
  const titleId = `${reviewElementId(row.id)}-title`;
  const status = reviewStatusDisplay(row.status);
  const byline = moderationByline({
    status: row.status,
    moderatedAt: row.moderatedAt,
    moderator: row.moderator,
    currentAdminId,
  });
  const productHref = `/admin/products/${encodeURIComponent(row.product.id)}`;
  const title = row.title.trim();
  const name = row.displayName.trim();

  return (
    <li>
      <article
        id={reviewElementId(row.id)}
        tabIndex={-1}
        aria-labelledby={titleId}
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 px-4 py-4 outline-none focus-visible:outline focus-visible:outline-[1.5px] focus-visible:-outline-offset-2 focus-visible:outline-ring md:grid-cols-[auto_minmax(0,1fr)_15rem] md:gap-x-6 md:px-5 md:py-5"
      >
        <div className="pt-0.5">
          <ReviewSelectBox id={row.id} label={item.label} />
        </div>

        <div className="min-w-0">
          {/* The product */}
          <div className="flex items-start gap-3">
            <div className="w-10 shrink-0 border">
              {row.product.image ? (
                <MediaThumb media={row.product.image} sizes="2.5rem" alt="" />
              ) : (
                <div aria-hidden="true" className="aspect-4/5 bg-surface" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-caption text-muted-foreground">Review of</p>
              <Link
                href={productHref}
                className="text-body-sm font-medium break-words text-foreground underline-offset-4 hover:underline"
              >
                {row.product.name}
              </Link>
              {row.product.status !== "ACTIVE" ? (
                <span className="mt-1 block">
                  <StatusBadge tone="neutral">
                    <span className="sr-only">Product: </span>
                    {productStatusDisplay(row.product.status).label}
                  </StatusBadge>
                </span>
              ) : null}
            </div>
          </div>

          {/* The review */}
          <div className="mt-4">
            <ReviewRating rating={row.rating} />
            <h3 id={titleId} className="mt-1.5 text-body font-medium [overflow-wrap:anywhere]">
              {title || <span className="font-normal text-muted-foreground">No title</span>}
            </h3>
            <div className="mt-1.5">
              <ReviewBody body={row.body} long={isLongReviewBody(row.body)} />
            </div>
          </div>

          {/* Who wrote it */}
          <div className="mt-4 space-y-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">
              <span className="[overflow-wrap:anywhere]">
                <span className="text-muted-foreground">By </span>
                {name || <span className="text-muted-foreground">no name given</span>}
              </span>
              {row.isVerifiedPurchase ? <StatusBadge tone="positive">Verified purchase</StatusBadge> : null}
              {row.isDemo ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge tone="info">Demo</StatusBadge>
                  <span className="text-caption text-muted-foreground">
                    Demo content, never shown as genuine
                  </span>
                </span>
              ) : null}
            </p>
            {row.orderNumber || row.customer ? (
              <dl className="grid gap-1 text-caption text-muted-foreground">
                {row.orderNumber ? (
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt>Order</dt>
                    <dd>
                      <Link
                        href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}
                        className={smallLink}
                      >
                        {row.orderNumber}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {row.customer ? (
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt>Account</dt>
                    <dd className="min-w-0 [overflow-wrap:anywhere]">
                      <Link
                        href={`/admin/customers/${encodeURIComponent(row.customer.id)}`}
                        className={smallLink}
                      >
                        {row.customer.email}
                      </Link>{" "}
                      <span>(private — never shown with the review)</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </div>

        {/* Status, dates and actions */}
        <div className="col-start-2 flex min-w-0 flex-col items-start gap-3 md:col-start-3 md:row-start-1 md:border-l md:pl-6">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <dl className="grid gap-1 text-caption text-muted-foreground">
            <div className="flex flex-wrap gap-x-1.5">
              <dt>Submitted</dt>
              <dd>
                <time dateTime={row.createdAt.toISOString()} title={formatAdminDateTime(row.createdAt)}>
                  {formatAdminDate(row.createdAt)}
                </time>
              </dd>
            </div>
            {byline && row.moderatedAt ? (
              <div>
                <dt className="sr-only">Last moderated</dt>
                <dd className="[overflow-wrap:anywhere]">
                  {byline},{" "}
                  <time dateTime={row.moderatedAt.toISOString()} title={formatAdminDateTime(row.moderatedAt)}>
                    {formatRelative(row.moderatedAt, now)}
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>
          <ReviewActions review={item} />
        </div>
      </article>
    </li>
  );
}
