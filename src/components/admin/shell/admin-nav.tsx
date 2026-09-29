"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV, adminNavCurrent, type AdminNavCounts } from "@/components/admin/admin-nav-config";
import { cn } from "@/lib/utils";

export interface AdminNavProps {
  /** Server-computed counts; a pending promise shows the links at once and the counts when ready. */
  counts: Promise<AdminNavCounts | null> | AdminNavCounts | null;
  /** Called when a link is chosen (the phone menu closes itself with it). */
  onNavigate?: () => void;
  className?: string;
}

/** The admin navigation list, marking the current section with aria-current. */
export function AdminNav({ counts, onNavigate, className }: AdminNavProps) {
  if (isPromise(counts)) {
    return (
      <Suspense fallback={<NavList counts={null} onNavigate={onNavigate} className={className} />}>
        <NavWithCounts counts={counts} onNavigate={onNavigate} className={className} />
      </Suspense>
    );
  }
  return <NavList counts={counts} onNavigate={onNavigate} className={className} />;
}

/** Promises from the server arrive as thenables, which aren't always `instanceof Promise`. */
function isPromise<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

function NavWithCounts({
  counts,
  ...props
}: Omit<AdminNavProps, "counts"> & { counts: Promise<AdminNavCounts | null> }) {
  return <NavList counts={use(counts)} {...props} />;
}

function NavList({ counts, onNavigate, className }: Omit<AdminNavProps, "counts"> & { counts: AdminNavCounts | null }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className={className}>
      <ul>
        {ADMIN_NAV.map((item) => {
          const current = adminNavCurrent(pathname, item.href);
          const count = item.count && counts ? counts[item.count] : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current}
                data-active={current ? "" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-3 border-l-2 border-transparent px-4 text-body-sm text-muted-foreground lg:min-h-10",
                  "transition-colors duration-150 hover:bg-surface/60 hover:text-foreground",
                  "data-active:border-foreground data-active:bg-surface data-active:font-medium data-active:text-foreground",
                )}
              >
                <span className="truncate">{item.label}</span>
                {count > 0 ? (
                  <span className="min-w-6 shrink-0 border border-border-strong px-1.5 py-px text-center text-micro font-medium tabular-nums text-foreground">
                    {count > 99 ? "99+" : count}
                    <span className="sr-only">
                      {" "}
                      {item.countLabel ?? "to review"}
                    </span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
