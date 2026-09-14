"use client";

import { cn } from "@/lib/utils";

import { useListing } from "./listing-provider";

/**
 * Holds the server-rendered results and dims them while a change is on its way.
 * The dim waits 150ms, so quick answers never flicker.
 */
export function ListingResults({ children }: { children: React.ReactNode }) {
  const { isPending, resultsRef } = useListing();

  return (
    <div
      ref={resultsRef}
      tabIndex={-1}
      aria-busy={isPending || undefined}
      className={cn(
        "outline-none transition-opacity duration-300 ease-editorial",
        isPending && "opacity-40 delay-150",
      )}
    >
      {children}
    </div>
  );
}
