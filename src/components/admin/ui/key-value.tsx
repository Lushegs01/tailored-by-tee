import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface KeyValueItem {
  label: string;
  /** null, undefined and "" show as a quiet dash. */
  value: ReactNode;
  /** Wrap long values (emails, references) anywhere rather than overflowing. */
  breakAll?: boolean;
}

/** Label/value pairs for detail pages (a <dl>): side by side from sm, stacked on phones. */
export function KeyValueList({
  items,
  columns = 1,
  className,
}: {
  items: KeyValueItem[];
  /** 2 puts pairs in two columns from md. */
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl className={cn("grid", columns === 2 && "md:grid-cols-2 md:gap-x-8", className)}>
      {items.map((item) => {
        const empty = item.value === null || item.value === undefined || item.value === "";
        return (
          <div
            key={item.label}
            className="grid min-w-0 gap-0.5 border-b py-2.5 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="text-caption text-muted-foreground sm:pt-px">{item.label}</dt>
            <dd className={cn("min-w-0 text-body-sm", item.breakAll ? "break-all" : "break-words")}>
              {empty ? <span className="text-muted-foreground">—</span> : item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
