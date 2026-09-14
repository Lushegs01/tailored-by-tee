import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import { productGridClassName } from "@/components/product/product-layout";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading state with the listing's real geometry: header, rail, toolbar, grid.
 * Fades in after a short delay (pure CSS), so quick navigations never flash it.
 */
export function ListingSkeleton({ rail = true }: { rail?: boolean }) {
  return (
    <div role="status" className="transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0">
      <span className="sr-only">Loading pieces</span>

      <div aria-hidden="true">
        <Container className="pt-6 md:pt-8">
          <Skeleton className="h-2.5 w-28" />
          <div className="mt-10 md:mt-14 xl:mt-16">
            <Skeleton className="h-9 w-2/3 max-w-sm md:h-14" />
            <Skeleton className="mt-5 h-3 w-full max-w-md" />
          </div>
        </Container>

        <Container className="pt-8 pb-24 md:pt-12">
          <div className={cn(rail && "lg:grid lg:grid-cols-12 lg:gap-x-8 xl:gap-x-12")}>
            {rail ? (
              <div className="hidden space-y-8 lg:col-span-3 lg:block 2xl:col-span-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-2.5 w-3/4" />
                ))}
              </div>
            ) : null}
            <div className={cn(rail && "lg:col-span-9 2xl:col-span-10")}>
              <div className="flex min-h-14 items-center justify-between border-y">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <ul className={cn(productGridClassName(rail ? 3 : 4), "mt-8 md:mt-10", rail && "2xl:grid-cols-4")}>
                {Array.from({ length: 8 }, (_, index) => (
                  <li key={index}>
                    <ProductCardSkeleton />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
}
