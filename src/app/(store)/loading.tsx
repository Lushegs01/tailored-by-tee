import { ProductCardSkeleton } from "@/components/product/product-card-skeleton";
import { productGridClassName } from "@/components/product/product-layout";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Default route skeleton, shown inside the site chrome: a listing-page opener and a
 * product grid with the real card geometry. It fades in after a short delay (pure
 * CSS via @starting-style), so quick navigations never flash a skeleton.
 */
export default function Loading() {
  return (
    <Container className="pb-20 pt-10 transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0 md:pb-28 md:pt-14 xl:pt-16">
      <div role="status">
        <span className="sr-only">Loading</span>

        <div aria-hidden="true">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-6 h-9 w-3/4 max-w-md md:h-14 md:max-w-xl" />
          <Skeleton className="mt-6 h-3 w-full max-w-md" />
          <Skeleton className="mt-2.5 h-3 w-2/3 max-w-xs" />

          <div className="mt-12 flex items-center justify-between border-y py-4 md:mt-16">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>

          <ul className={`${productGridClassName(4)} mt-8 md:mt-10`}>
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index}>
                <ProductCardSkeleton />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Container>
  );
}
