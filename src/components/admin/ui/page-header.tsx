import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminBreadcrumb {
  label: string;
  /** Omit on the current page. */
  href?: string;
}

export interface AdminPageHeaderProps {
  title: string;
  /** One calm sentence under the title. */
  description?: ReactNode;
  /** e.g. [{ label: "Orders", href: "/admin/orders" }, { label: "ORD-2026-001284" }] */
  breadcrumbs?: AdminBreadcrumb[];
  /** Page-level actions; at most one primary button. */
  actions?: ReactNode;
  /** A row under the title for badges and facts, e.g. a StatusBadge and the order date. */
  meta?: ReactNode;
  className?: string;
}

/** The top of every admin page: breadcrumbs, the page's h1, a short description and its actions. */
export function AdminPageHeader({ title, description, breadcrumbs, actions, meta, className }: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between md:gap-8",
        className,
      )}
    >
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? <AdminBreadcrumbs items={breadcrumbs} /> : null}
        <h1 className="font-display text-display-xs break-words">{title}</h1>
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">{meta}</div> : null}
        {description ? (
          <div className="mt-2 max-w-2xl text-body-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:justify-end">{actions}</div> : null}
    </header>
  );
}

/** Breadcrumb trail; the last item without an href is marked as the current page. */
export function AdminBreadcrumbs({ items, className }: { items: AdminBreadcrumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-2", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-x-2">
              {item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-6 items-center break-all transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="break-all text-foreground">
                  {item.label}
                </span>
              )}
              {last ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
