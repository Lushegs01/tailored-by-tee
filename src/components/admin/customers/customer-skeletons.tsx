import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * The shapes the customers pages hold while they load, so nothing jumps when the
 * figures arrive. No full-page spinners.
 */

/** /admin/customers: header, the four figures, the toolbar and the list. */
export function CustomersListSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton actions={false} />
      <StatGridSkeleton className="mt-6" />
      <TableSkeleton header={false} columns={5} className="mt-8" />
    </div>
  );
}

function SectionSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("border bg-background-raised", className)} aria-hidden="true">
      <div className="border-b px-4 py-4 md:px-5">
        <Skeleton className="h-2.5 w-32" />
      </div>
      <div className="space-y-3 p-4 md:p-5">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className={cn("h-3", index === 0 ? "w-2/3" : "w-full max-w-md")} />
        ))}
      </div>
    </div>
  );
}

/** One customer's page: header, figures, then the profile and orders panels. */
export function CustomerDetailSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton actions={false} />
      <StatGridSkeleton className="mt-6" />
      <div className="mt-6 space-y-6">
        <SectionSkeleton rows={5} />
        <SectionSkeleton rows={3} />
      </div>
    </div>
  );
}
