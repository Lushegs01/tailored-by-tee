import { cn } from "@/lib/utils";

import { clampRating, ratingText } from "./review-rules";

const STAR = "M8 1.2l2.03 4.3 4.7.6-3.44 3.26.87 4.66L8 11.74 3.84 14.02l.87-4.66L1.27 6.1l4.7-.6z";

/**
 * A 1–5 rating: five stars and "4/5" to see, "Rated 4 out of 5" to hear. Low
 * ratings aren't coloured differently — the number says it.
 */
export function ReviewRating({ rating, className }: { rating: number; className?: string }) {
  const stars = clampRating(rating);
  return (
    <p className={cn("flex items-center gap-2", className)}>
      <span aria-hidden="true" className="flex items-center gap-0.5 text-foreground">
        {Array.from({ length: 5 }, (_, index) => (
          <svg key={index} viewBox="0 0 16 16" width="0.875rem" height="0.875rem" focusable="false">
            <path
              d={STAR}
              fill={index < stars ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
              opacity={index < stars ? 1 : 0.4}
            />
          </svg>
        ))}
      </span>
      <span aria-hidden="true" className="text-caption text-muted-foreground tabular-nums">
        {stars}/5
      </span>
      <span className="sr-only">{ratingText(stars)}</span>
    </p>
  );
}
