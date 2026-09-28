"use client";

import { useEffect } from "react";
import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/ui/empty-state";
import { Button } from "@/components/ui/button";

interface AdminErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment (Next 16's recovery). */
  retry: () => void;
}

/** Error boundary for admin pages. The navigation stays in place, so the admin can move on. */
export default function AdminError({ error, retry }: AdminErrorProps) {
  useEffect(() => {
    // Console only for now — wire to an error-reporting service before launch.
    console.error(error);
  }, [error]);

  return (
    <div className="border bg-background-raised">
      <AdminEmptyState
        as="h1"
        title="This page didn’t load"
        body={
          <>
            <p>
              Something went wrong while loading it. Nothing you saved earlier is affected. Try again, or go back to the
              overview.
            </p>
            {error.digest ? (
              <p className="mt-3 text-caption">
                Reference <span className="select-all tabular-nums">{error.digest}</span>
              </p>
            ) : null}
          </>
        }
        action={
          <>
            <Button size="sm" onClick={() => retry()}>
              Try again
            </Button>
            <Link href="/admin" className="inline-flex min-h-10 items-center text-body-sm">
              <span className="link-underline-static pb-0.5">Go to overview</span>
            </Link>
          </>
        }
      />
    </div>
  );
}
