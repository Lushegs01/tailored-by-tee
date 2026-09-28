import { ReviewsSkeleton } from "@/components/admin/reviews/reviews-skeleton";

/** The reviews page's shape while it loads: header, status tabs, toolbar and review cards. */
export default function ReviewsLoading() {
  return <ReviewsSkeleton />;
}
