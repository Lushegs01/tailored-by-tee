import { Skeleton } from "@/components/ui/skeleton";

/** One order's skeleton in the account's content column. Fades in after a short delay so quick loads never flash. */
export default function AccountOrderLoading() {
  return (
    <div role="status" className="transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0">
      <span className="sr-only">Loading your order</span>
      <div aria-hidden="true">
        <Skeleton className="h-2.5 w-20" />
        <div className="mt-8 flex items-center gap-4">
          <Skeleton className="h-2.5 w-32" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="mt-5 h-9 w-2/3 max-w-sm md:h-11" />
        <Skeleton className="mt-6 h-3 w-full max-w-md" />
        <div className="mt-14 grid gap-10 border-t pt-10 md:grid-cols-12">
          <div className="space-y-5 md:col-span-7">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-4 md:col-span-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
