import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountOrdersLoading() {
  return (
    <Container className="pt-12 pb-24 md:pt-20">
      <div role="status" className="mx-auto max-w-5xl transition-opacity delay-150 duration-700 starting:opacity-0">
        <span className="sr-only">Loading your orders</span>
        <div aria-hidden="true">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-6 h-12 w-2/3 max-w-sm" />
          <Skeleton className="mt-6 h-3 w-full max-w-md" />
          <div className="mt-10 border-t md:mt-12">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-4 border-b py-6 md:flex md:items-center md:gap-x-8"
              >
                <div className="md:order-2 md:flex-1">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="mt-2 h-2.5 w-28" />
                </div>
                <Skeleton className="h-3.5 w-16 justify-self-end md:order-4 md:w-28" />
                <div className="col-span-2 flex items-end justify-between gap-4 md:contents">
                  <div className="flex gap-2 md:order-1 md:w-40">
                    <Skeleton className="aspect-4/5 w-12" />
                    <Skeleton className="aspect-4/5 w-12" />
                  </div>
                  <div className="md:order-3 md:w-40">
                    <Skeleton className="h-6 w-28" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
