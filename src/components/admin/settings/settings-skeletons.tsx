import { AdminSection, PageHeaderSkeleton } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Loading shapes for the settings page. The section frames and titles render at
 * once (so the "On this page" links already have somewhere to go); only their
 * contents wait for the database.
 */

export const SETTINGS_SECTION_CLASS = "scroll-mt-20 lg:scroll-mt-8";

/** Placeholder rows for a section body: a label/value line each, stacked on phones. */
export function SectionRowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div
      role="status"
      className={cn("transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0", className)}
    >
      <span className="sr-only">Loading</span>
      <ul aria-hidden="true" className="divide-y">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="flex flex-col gap-2 px-4 py-3.5 md:flex-row md:items-center md:gap-6 md:px-5">
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-2.5 w-64 max-w-full md:flex-1" />
            <Skeleton className="h-2.5 w-20" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A section with its real title and placeholder rows, for Suspense fallbacks. */
export function SectionSkeleton({ id, title, rows }: { id: string; title: string; rows?: number }) {
  return (
    <AdminSection id={id} title={title} flush className={SETTINGS_SECTION_CLASS}>
      <SectionRowsSkeleton rows={rows} />
    </AdminSection>
  );
}

/** The whole settings page while it loads (route-level loading.tsx). */
export function SettingsPageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton actions={false} />
      <div className="mt-6 space-y-8">
        {[6, 3, 5].map((rows, index) => (
          <div key={index} className="border bg-background-raised" aria-hidden="true">
            <div className="border-b px-4 py-4 md:px-5">
              <Skeleton className="h-2.5 w-32" />
            </div>
            <SectionRowsSkeleton rows={rows} />
          </div>
        ))}
      </div>
    </div>
  );
}
