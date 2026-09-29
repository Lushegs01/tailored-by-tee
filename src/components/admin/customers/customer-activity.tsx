import Link from "next/link";

import { AdminEmptyState, StatusBadge } from "@/components/admin/ui";
import type { CustomerReview, CustomerWishlistItem } from "@/lib/admin/customers";
import { formatAdminDate, formatAdminDateTime, formatNumber } from "@/lib/admin/format";
import { productStatusDisplay, reviewStatusDisplay } from "@/lib/admin/status";

import { customerReviewsHref, productHref } from "./customer-rules";

/*
 * What a customer has done besides buying: the pieces they have saved, and the
 * reviews they have written. Read-only — reviews are approved or rejected on the
 * Reviews page, where the whole review and its context are shown.
 */

/** Pieces saved to their wishlist, most recently added first. */
export function CustomerWishlist({ count, items }: { count: number; items: readonly CustomerWishlistItem[] }) {
  if (count === 0) {
    return (
      <AdminEmptyState
        title="Nothing saved"
        body="They haven’t saved any pieces yet. A wishlist only exists once they sign in and save something."
      />
    );
  }

  return (
    <>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-body-sm">
        {items.map((item) => {
          const status = productStatusDisplay(item.status);
          return (
            <li key={item.productId} className="flex min-w-0 items-center gap-2">
              <Link href={productHref(item.productId)} className="min-w-0 break-words">
                <span className="link-underline-static pb-0.5">{item.name}</span>
              </Link>
              {item.status === "ACTIVE" ? null : <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
            </li>
          );
        })}
      </ul>
      {count > items.length ? (
        <p className="mt-3 text-caption text-muted-foreground">
          Showing {formatNumber(items.length)} of {formatNumber(count)} saved pieces.
        </p>
      ) : null}
    </>
  );
}

/** Five stars, with the rating spelled out for screen readers. */
function Rating({ rating }: { rating: number }) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="tracking-[0.15em] text-accent-brand">
        {"★".repeat(value)}
        <span className="text-muted-foreground/50">{"★".repeat(5 - value)}</span>
      </span>
      <span className="sr-only">Rated {value} out of 5</span>
    </span>
  );
}

/** Reviews they have written, newest first, each linked to its product's reviews. */
export function CustomerReviews({
  reviews,
  count,
}: {
  reviews: readonly CustomerReview[];
  count: number;
}) {
  if (count === 0) {
    return (
      <AdminEmptyState
        title="No reviews written"
        body="Nothing to approve from this customer. Reviews appear here as soon as they write one."
      />
    );
  }

  return (
    <>
      <ul className="divide-y">
        {reviews.map((review) => {
          const status = reviewStatusDisplay(review.status);
          return (
            <li key={review.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Rating rating={review.rating} />
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {review.isVerifiedPurchase ? <StatusBadge tone="positive">Verified purchase</StatusBadge> : null}
                {review.isDemo ? <StatusBadge tone="neutral">Demo</StatusBadge> : null}
              </div>
              <p className="text-body-sm break-words">{review.title}</p>
              <p className="text-caption text-muted-foreground">
                <Link href={customerReviewsHref(review.product.id)} className="break-words">
                  <span className="link-underline-static pb-0.5">{review.product.name}</span>
                </Link>
                {" · "}
                <time dateTime={review.createdAt} title={formatAdminDateTime(review.createdAt)}>
                  {formatAdminDate(review.createdAt)}
                </time>
              </p>
            </li>
          );
        })}
      </ul>
      {count > reviews.length ? (
        <p className="mt-3 text-caption text-muted-foreground">
          Showing the {formatNumber(reviews.length)} most recent of {formatNumber(count)} reviews.
        </p>
      ) : null}
    </>
  );
}
