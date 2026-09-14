import type { CartIssue } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

/*
 * Status messages for the bag (drawer and page). Deliberately quiet: a hairline
 * box and plain copy, never a red block. Screen readers hear these through the
 * cart live region. `className` replaces the drawer's inset.
 */

export function CartNotices({
  notices,
  onDismiss,
  className = "px-6 pt-5",
}: {
  notices: CartIssue[];
  onDismiss?: () => void;
  className?: string;
}) {
  if (notices.length === 0) return null;

  return (
    <div className={cn(className)}>
      <div className="border px-4 pt-3.5 pb-1">
        <p className="text-eyebrow text-muted-foreground">Your bag has been updated</p>
        <ul className="mt-2 space-y-1 text-body-sm">
          {notices.map((notice) => (
            <li key={`${notice.variantId}:${notice.kind}`}>{notice.message}</li>
          ))}
        </ul>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 items-center text-caption text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            <span className="link-underline-static pb-0.5">Dismiss</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CartError({ onRetry, className = "px-6 pt-5" }: { onRetry?: () => void; className?: string }) {
  return (
    <div className={cn(className)}>
      <div className="flex items-center justify-between gap-4 border py-1 pl-4 pr-3">
        <p className="py-2.5 text-body-sm">We could not update your bag just now.</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 shrink-0 items-center text-label">
            <span className="link-underline-static pb-1">Try again</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
