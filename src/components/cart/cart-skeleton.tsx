import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the exact footprint of a CartLineItem, so rows don't jump when prices land. */
export function CartLineSkeleton() {
  return (
    <li className="flex gap-4 py-5">
      <span className="sr-only">Loading item</span>
      <Skeleton className="aspect-4/5 w-24 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="mt-0.5 h-3.5 w-16" />
        </div>
        <Skeleton className="mt-auto h-11 w-30" />
      </div>
    </li>
  );
}

/** Stand-alone skeleton list, e.g. for a page-level bag view while the first quote loads. */
export function CartSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading your bag" className="px-6 [&>li+li]:border-t">
      {Array.from({ length: rows }, (_, index) => (
        <CartLineSkeleton key={index} />
      ))}
    </ul>
  );
}
