import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AdminSectionProps {
  title: string;
  description?: ReactNode;
  /** Section-level actions (links, secondary buttons) beside the title. */
  actions?: ReactNode;
  /** Pinned below the content, e.g. a "View all" link or a form's save row. */
  footer?: ReactNode;
  /** Remove the body padding, for tables and lists that run edge to edge. */
  flush?: boolean;
  /** Heading level inside the page (default h2). */
  as?: "h2" | "h3";
  id?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** A titled panel with a hairline frame; labelled by its heading for screen readers. */
export function AdminSection({
  title,
  description,
  actions,
  footer,
  flush = false,
  as: Heading = "h2",
  id,
  className,
  bodyClassName,
  children,
}: AdminSectionProps) {
  const headingId = useId();

  return (
    <section id={id} aria-labelledby={headingId} className={cn("min-w-0 border bg-background-raised", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b px-4 py-3 md:px-5">
        <div className="min-w-0 py-1">
          <Heading id={headingId} className="text-label">
            {title}
          </Heading>
          {description ? <div className="mt-2 text-caption text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{actions}</div> : null}
      </header>
      <div className={cn(flush ? "" : "p-4 md:p-5", bodyClassName)}>{children}</div>
      {footer ? <div className="border-t px-4 py-3 md:px-5">{footer}</div> : null}
    </section>
  );
}
