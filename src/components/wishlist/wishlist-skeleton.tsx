import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import { productGridClassName } from "@/components/product/product-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** One saved piece while it loads: the card's exact geometry, then the size choice and the two actions. */
export function WishlistItemSkeleton() {
  return (
    <div aria-hidden="true">
      <ProductCardSkeleton />
      <div className="mt-4 flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="mt-1 h-10 w-full" />
        <span className="flex h-11 items-center">
          <Skeleton className="h-2.5 w-14" />
        </span>
      </div>
    </div>
  );
}

/** The wishlist's loading state, laid out like the list so nothing shifts when it arrives. */
export function WishlistSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">Loading your wishlist</span>
      <div aria-hidden="true">
        <div className="border-b pb-4">
          <span className="flex h-[1.125rem] items-center">
            <Skeleton className="h-2.5 w-16" />
          </span>
        </div>
        <ul className={cn(productGridClassName(4), "mt-8")}>
          {Array.from({ length: count }, (_, index) => (
            <li key={index}>
              <WishlistItemSkeleton />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
