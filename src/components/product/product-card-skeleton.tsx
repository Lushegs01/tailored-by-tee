import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { productGridClassName, type ProductGridColumns } from "./product-layout";

/** The card's exact geometry — 4:5 frame, name/price line, colour line — so nothing shifts on load. */
export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <Skeleton className="aspect-4/5 w-full" />
      <div className="@container pt-3">
        <div className="flex flex-col @min-[13rem]:flex-row @min-[13rem]:justify-between @min-[13rem]:gap-3">
          <span className="flex h-[1.35rem] items-center @min-[13rem]:min-w-0 @min-[13rem]:flex-1">
            <Skeleton className="h-2.5 w-3/5" />
          </span>
          <span className="flex h-[1.35rem] items-center">
            <Skeleton className="h-2.5 w-14" />
          </span>
        </div>
        <span className="mt-1 flex h-[1.125rem] items-center">
          <Skeleton className="h-2 w-12" />
        </span>
      </div>
    </div>
  );
}

export interface ProductGridSkeletonProps {
  count?: number;
  columns?: ProductGridColumns;
  className?: string;
}

/** Loading state for ProductGrid (e.g. in a route's loading.tsx or a Suspense fallback). */
export function ProductGridSkeleton({ count = 8, columns = 4, className }: ProductGridSkeletonProps) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">Loading pieces</span>
      <ul aria-hidden="true" className={productGridClassName(columns)}>
        {Array.from({ length: count }, (_, index) => (
          <li key={index}>
            <ProductCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
