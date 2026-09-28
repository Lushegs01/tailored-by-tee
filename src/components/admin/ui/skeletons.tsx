import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Loading placeholders shaped like the real admin layouts, for loading.tsx files
 * and Suspense fallbacks. Each announces "Loading" once and hides its shapes from
 * screen readers. They fade in after a short delay (pure CSS via @starting-style),
 * so quick navigations never flash a skeleton.
 */

const FADE_IN = "transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0";

function Loading({ label = "Loading", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" className={cn(FADE_IN, className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function HeaderShapes({ actions = true }: { actions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-3 h-7 w-56 max-w-full" />
        <Skeleton className="mt-3 h-3 w-80 max-w-full" />
      </div>
      {actions ? <Skeleton className="h-10 w-36" /> : null}
    </div>
  );
}

/** The page header's geometry: breadcrumb, title, description and an action. */
export function PageHeaderSkeleton({ actions = true, className }: { actions?: boolean; className?: string }) {
  return (
    <Loading className={className}>
      <HeaderShapes actions={actions} />
    </Loading>
  );
}

/** A list page: header, toolbar and a table (stacked rows on phones). */
export function TableSkeleton({
  rows = 8,
  columns = 5,
  header = true,
  toolbar = true,
  className,
}: {
  rows?: number;
  columns?: number;
  header?: boolean;
  toolbar?: boolean;
  className?: string;
}) {
  const cells = Array.from({ length: columns }, (_, index) => index);

  return (
    <Loading className={className}>
      {header ? <HeaderShapes /> : null}
      {toolbar ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 w-full sm:max-w-xs" />
          <Skeleton className="h-10 w-full sm:w-40" />
        </div>
      ) : null}
      <div className={cn("border bg-background-raised", (header || toolbar) && "mt-4")}>
        <div className="hidden gap-6 border-b px-4 py-3 md:flex">
          {cells.map((cell) => (
            <Skeleton key={cell} className={cn("h-2.5", cell === 0 ? "w-28" : "flex-1")} />
          ))}
        </div>
        <ul className="divide-y">
          {Array.from({ length: rows }, (_, row) => (
            <li key={row} className="px-4 py-3.5">
              <div className="hidden items-center gap-6 md:flex">
                {cells.map((cell) => (
                  <Skeleton key={cell} className={cn("h-3", cell === 0 ? "w-28" : "flex-1")} />
                ))}
              </div>
              <div className="space-y-2 md:hidden">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-56 max-w-full" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </Loading>
  );
}

/** An edit page: header and one or more sections of labelled fields. */
export function FormSkeleton({
  fields = 6,
  sections = 1,
  header = true,
  className,
}: {
  fields?: number;
  sections?: number;
  header?: boolean;
  className?: string;
}) {
  return (
    <Loading className={className}>
      {header ? <HeaderShapes /> : null}
      <div className={cn("space-y-6", header && "mt-6")}>
        {Array.from({ length: sections }, (_, section) => (
          <div key={section} className="border bg-background-raised">
            <div className="border-b px-4 py-4 md:px-5">
              <Skeleton className="h-2.5 w-32" />
            </div>
            <div className="grid gap-5 p-4 md:grid-cols-2 md:p-5">
              {Array.from({ length: fields }, (_, field) => (
                <div key={field}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-10 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A row of headline figures, matching StatGrid. */
export function StatGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <Loading className={className}>
      <div className="grid grid-cols-1 gap-px border bg-border min-[380px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="bg-background-raised p-4">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>
    </Loading>
  );
}
