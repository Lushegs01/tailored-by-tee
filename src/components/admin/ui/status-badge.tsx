import type { ReactNode } from "react";

import type { StatusTone } from "@/lib/admin/status";
import { cn } from "@/lib/utils";

export type { StatusTone };

const TONES: Record<StatusTone, string> = {
  neutral: "border-border-strong text-muted-foreground",
  positive: "border-success/50 text-success",
  attention: "border-accent-brand/60 text-accent-brand",
  critical: "border-danger/60 text-danger",
  info: "border-foreground/40 text-foreground",
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}

/**
 * A status word in a square hairline frame: <StatusBadge tone="attention">To prepare</StatusBadge>.
 * Get the word and tone from lib/admin/status (orderStatusDisplay, stockDisplay …) so every page agrees.
 */
export function StatusBadge({ tone = "neutral", children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 border px-1.5 py-0.5 text-micro font-medium uppercase tracking-[0.08em] whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 bg-current" />
      <span className="truncate">{children}</span>
    </span>
  );
}
