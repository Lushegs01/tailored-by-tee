import { PageHeaderSkeleton } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * The reviews page's shape while it loads: header, the status tabs, the toolbar
 * and a few review cards (tick box, product, rating and text, side column).
 */

const FADE_IN = "transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0";

export function ReviewsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div>
      <PageHeaderSkeleton actions={false} />
      <div role="status" className={cn("mt-6", FADE_IN)}>
        <span className="sr-only">Loading reviews</span>
        <div aria-hidden="true">
          <div className="flex gap-4 overflow-hidden border-b pb-3">
            {["w-36", "w-24", "w-20", "w-24"].map((width, index) => (
              <Skeleton key={index} className={cn("h-3", width)} />
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 w-full sm:max-w-xs" />
            <Skeleton className="h-10 w-full sm:w-40" />
            <Skeleton className="h-10 w-full sm:w-40" />
          </div>
          <div className="mt-4 border bg-background-raised">
            <div className="flex items-center justify-between border-b px-4 py-4 md:px-5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
            <ul className="divide-y">
              {Array.from({ length: cards }, (_, index) => (
                <li
                  key={index}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 px-4 py-4 md:grid-cols-[auto_minmax(0,1fr)_15rem] md:gap-x-6 md:px-5 md:py-5"
                >
                  <Skeleton className="size-4" />
                  <div>
                    <div className="flex items-start gap-3">
                      <Skeleton className="aspect-4/5 w-10" />
                      <div className="flex-1">
                        <Skeleton className="h-2.5 w-16" />
                        <Skeleton className="mt-2 h-3 w-40 max-w-full" />
                      </div>
                    </div>
                    <Skeleton className="mt-5 h-3 w-24" />
                    <Skeleton className="mt-3 h-3.5 w-56 max-w-full" />
                    <Skeleton className="mt-3 h-2.5 w-full" />
                    <Skeleton className="mt-2 h-2.5 w-11/12" />
                    <Skeleton className="mt-2 h-2.5 w-2/3" />
                  </div>
                  <div className="col-start-2 md:col-start-3 md:row-start-1 md:border-l md:pl-6">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="mt-3 h-2.5 w-32" />
                    <div className="mt-4 flex gap-2">
                      <Skeleton className="h-9 w-24" />
                      <Skeleton className="h-9 w-20" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
