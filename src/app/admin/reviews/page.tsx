import type { ReactNode } from "react";
import Link from "next/link";

import { ReviewList } from "@/components/admin/reviews/review-list";
import { ReviewsUnavailable, StorefrontReviewsNote } from "@/components/admin/reviews/review-notices";
import {
  DEMO_FILTER_OPTIONS,
  RATING_FILTER_OPTIONS,
  REVIEWS_PATH,
  STOREFRONT_SHOWS_REVIEWS,
  VERIFIED_FILTER_OPTIONS,
  currentReviewTab,
  hasReviewFilters,
  parseReviewListParams,
  reviewSortValue,
  reviewTabHref,
  toReviewListQuery,
  type ReviewTab,
  type ReviewTabCounts,
} from "@/components/admin/reviews/review-rules";
import { ReviewSortSelect } from "@/components/admin/reviews/review-sort-select";
import { ReviewTabs } from "@/components/admin/reviews/review-tabs";
import {
  AdminEmptyState,
  AdminPageHeader,
  ListToolbar,
  Pagination,
  type ListToolbarFilter,
} from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { buildListHref, type ListParams } from "@/lib/admin/pagination";
import { getReviewFilterProduct, listReviews } from "@/lib/admin/reviews";

export const metadata = adminMetadata("Reviews");

const FILTERS: ListToolbarFilter[] = [
  { name: "rating", label: "Rating", allLabel: "All ratings", options: RATING_FILTER_OPTIONS },
  {
    name: "verified",
    label: "Verified purchase",
    allLabel: "Verified or not",
    options: VERIFIED_FILTER_OPTIONS,
  },
  { name: "demo", label: "Demo content", allLabel: "Demo and genuine", options: DEMO_FILTER_OPTIONS },
];

const linkClassName = "text-body-sm text-foreground";

/**
 * /admin/reviews — moderating what customers write. Nothing is shown in the
 * store until it's approved, and demo reviews never as genuine ones.
 *
 * Tabs by status (?status=PENDING, the default, APPROVED, REJECTED or ALL), with
 * a search (?q= — product, reviewer, account email or words in the review),
 * filters (?rating=1–5, ?verified=yes|no, ?demo=hide|only, ?product=<id> for one
 * product's reviews) and an order (?sort=createdAt|rating&dir=). Each review can
 * be approved, rejected, returned to waiting or deleted; ticked reviews can be
 * handled together from the bar that appears.
 */
export default async function ReviewsPage(props: PageProps<"/admin/reviews">) {
  const admin = await requireAdminPage(REVIEWS_PATH);

  const parsed = parseReviewListParams(await props.searchParams);
  const query = toReviewListQuery(parsed);
  const [load, filterProduct] = await Promise.all([
    listReviews(query),
    query.productId ? getReviewFilterProduct(query.productId) : Promise.resolve(null),
  ]);
  const now = new Date();

  return (
    <>
      <AdminPageHeader
        title="Reviews"
        description="What customers write about their pieces. Nothing is shown in the store until you approve it, and demo reviews are never shown as genuine ones."
      />

      {STOREFRONT_SHOWS_REVIEWS ? null : <StorefrontReviewsNote className="mt-6" />}

      {!load.ok ? (
        <div className="mt-6 border bg-background-raised">
          <ReviewsUnavailable reason={load.reason} />
        </div>
      ) : (
        <ReviewsListing
          params={{ ...parsed, page: load.page }}
          tab={query.tab}
          counts={load.counts}
          total={load.total}
          productFilter={query.productId ? { id: query.productId, product: filterProduct } : null}
        >
          {load.rows.length > 0 ? (
            <ReviewList
              rows={load.rows}
              tab={query.tab}
              total={load.total}
              currentAdminId={admin.id}
              now={now}
            />
          ) : null}
        </ReviewsListing>
      )}
    </>
  );
}

function ReviewsListing({
  params,
  tab,
  counts,
  total,
  productFilter,
  children,
}: {
  params: ListParams;
  tab: ReviewTab;
  counts: ReviewTabCounts;
  total: number;
  productFilter: { id: string; product: { id: string; name: string } | null } | null;
  children: ReactNode;
}) {
  return (
    <>
      <ReviewTabs className="mt-6" params={params} current={currentReviewTab(params)} counts={counts} />

      <ListToolbar
        className="mt-5"
        searchLabel="Search reviews"
        searchPlaceholder="Product, reviewer, email or words"
        filters={FILTERS}
      >
        <ReviewSortSelect value={reviewSortValue(params)} />
      </ListToolbar>

      {productFilter ? (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-body-sm">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {productFilter.product ? (
              <>
                Showing reviews of{" "}
                <Link
                  href={`/admin/products/${encodeURIComponent(productFilter.product.id)}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {productFilter.product.name}
                </Link>{" "}
                only.
              </>
            ) : (
              "The product in this link can’t be found — it may have been deleted."
            )}
          </span>
          <Link
            href={buildListHref(REVIEWS_PATH, params, { filters: { product: null } })}
            className={linkClassName}
          >
            <span className="link-underline-static pb-0.5">Show every product</span>
          </Link>
        </p>
      ) : null}

      <div className="mt-4">
        {total > 0 && children ? (
          children
        ) : (
          <div className="border bg-background-raised">
            <ReviewsEmpty params={params} tab={tab} counts={counts} />
          </div>
        )}
      </div>

      <Pagination
        base={REVIEWS_PATH}
        params={params}
        total={total}
        noun={{ one: "review", other: "reviews" }}
      />
    </>
  );
}

/** Nothing on this tab: say why, and where to go next. */
function ReviewsEmpty({
  params,
  tab,
  counts,
}: {
  params: ListParams;
  tab: ReviewTab;
  counts: ReviewTabCounts;
}) {
  if (hasReviewFilters(params)) {
    const elsewhere = counts.ALL;
    return (
      <AdminEmptyState
        as="h2"
        title="No reviews match"
        body={
          elsewhere > 0
            ? `Nothing on this tab matches the search and filters, but ${formatNumber(elsewhere)} ${elsewhere === 1 ? "review does" : "reviews do"} on the others — see the counts above.`
            : "No reviews match this search and these filters. Try another search, or clear the filters."
        }
        action={
          <Link
            href={buildListHref(REVIEWS_PATH, params, {
              clear: true,
              filters: { status: params.filters.status ?? null },
            })}
            className={linkClassName}
          >
            <span className="link-underline-static pb-0.5">Clear search and filters</span>
          </Link>
        }
      />
    );
  }

  const waiting = counts.PENDING;
  const waitingLink =
    waiting > 0 ? (
      <Link href={reviewTabHref(params, "PENDING")} className={linkClassName}>
        <span className="link-underline-static pb-0.5">
          See the {formatNumber(waiting)} waiting for approval
        </span>
      </Link>
    ) : undefined;

  switch (tab) {
    case "PENDING":
      return (
        <AdminEmptyState
          as="h2"
          title="Nothing waiting for approval"
          body={
            counts.ALL > 0
              ? "You’re all caught up. New reviews will appear here, and none is shown in the store until you approve it."
              : "When customers review what they’ve bought, their reviews will appear here for you to approve. None is shown in the store until you do."
          }
        />
      );
    case "APPROVED":
      return (
        <AdminEmptyState
          as="h2"
          title="No published reviews"
          body="Reviews you approve appear here. They are the only reviews customers can see."
          action={waitingLink}
        />
      );
    case "REJECTED":
      return (
        <AdminEmptyState
          as="h2"
          title="No rejected reviews"
          body="Reviews you reject stay here, out of the store, in case you change your mind."
          action={waitingLink}
        />
      );
    default:
      return (
        <AdminEmptyState
          as="h2"
          title="No reviews yet"
          body="When customers review what they’ve bought, their reviews will appear here for you to approve."
        />
      );
  }
}
