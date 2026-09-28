import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Placeholders for the overview's sections while their figures stream in, shaped
 * like the real thing so nothing jumps. Each says "Loading …" once to screen
 * readers and fades in after a moment, so fast loads never flash a skeleton
 * (the same approach as the admin kit's skeletons).
 */

const FADE_IN = "transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0";

function Loading({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" className={cn(FADE_IN, className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function Tiles({ count, className, lastClassName }: { count: number; className?: string; lastClassName?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-px border bg-border min-[380px]:grid-cols-2", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn("bg-background-raised p-4", index === count - 1 && lastClassName)}>
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-2.5 w-28 max-w-full" />
        </div>
      ))}
    </div>
  );
}

/** "Needs attention": its heading line and five figures. */
export function AttentionSkeleton() {
  return (
    <Loading label="Loading what needs attention">
      <div className="mb-3 flex items-center justify-between gap-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-28" />
      </div>
      <Tiles count={5} className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" lastClassName="col-span-2 xl:col-span-1" />
    </Loading>
  );
}

/** The sales figures and chart, inside the sales section's frame. */
export function SalesFiguresSkeleton() {
  return (
    <Loading label="Loading sales figures" className="space-y-6">
      <Tiles count={4} className="lg:grid-cols-4" />
      <div>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-5 h-2.5 w-24" />
        <Skeleton className="mt-2 h-5 w-32" />
        <Skeleton className="mt-5 h-44 w-full md:h-56" />
      </div>
    </Loading>
  );
}

/** A framed section with a title and some rows (latest orders, stock to watch). */
export function SectionListSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <Loading label={label} className="border bg-background-raised">
      <div className="flex items-center justify-between border-b px-4 py-4 md:px-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <ul className="divide-y">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="flex items-center gap-6 px-4 py-3.5 md:px-5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-36 max-w-full" />
              <Skeleton className="h-2.5 w-48 max-w-full" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}
