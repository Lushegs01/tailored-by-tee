import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for the Photos section while it loads, e.g.
 * <Suspense fallback={<ProductImagesSkeleton />}><ProductImagesSection productId={id} /></Suspense>.
 */
export function ProductImagesSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" className="border bg-background-raised">
      <span className="sr-only">Loading photos</span>
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-6 border-b px-4 py-4 md:px-5">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 shrink-0" />
        </div>
        <div className="space-y-2 p-4 md:p-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-80 max-w-full" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex gap-4 border-t p-4 md:p-5">
            <Skeleton className="aspect-4/5 w-20 shrink-0 sm:w-28" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-48 max-w-full" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
