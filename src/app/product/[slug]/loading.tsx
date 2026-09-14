import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/** The product page's geometry — gallery, then the details column — so nothing shifts on arrival. */
export default function ProductLoading() {
  return (
    <div role="status" className="transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0">
      <span className="sr-only">Loading piece</span>
      <div aria-hidden="true">
        <Container className="pt-6 md:pt-8">
          <Skeleton className="h-2.5 w-48" />
        </Container>
        <div className="mx-auto max-w-(--container-max) pt-6 md:grid md:grid-cols-12 md:gap-x-8 md:px-(--gutter) md:pt-8 xl:gap-x-12">
          <Skeleton className="aspect-4/5 md:col-span-6 lg:col-span-7" />
          <div className="px-(--gutter) pt-8 md:col-span-6 md:px-0 md:pt-0 lg:col-span-5 xl:col-span-4 xl:col-start-9">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-5 h-9 w-3/4" />
            <Skeleton className="mt-5 h-3 w-24" />
            <Skeleton className="mt-7 h-3 w-full" />
            <Skeleton className="mt-2.5 h-3 w-2/3" />
            <div className="mt-10 flex gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="size-7 rounded-full" />
              ))}
            </div>
            <div className="mt-8 grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
            <Skeleton className="mt-8 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
