import type { ReactNode } from "react";

import { Emphasis } from "@/components/ui/emphasis";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  eyebrow?: string;
  /** Supports *emphasis*, set in italic serif. */
  title: string;
  /** A sentence or two. Strings are wrapped in a paragraph. */
  body?: ReactNode;
  /** The way forward — at most one filled button, the rest text links. */
  actions?: ReactNode;
  /** Anything after the actions: a reference code, a short list of links. */
  children?: ReactNode;
  as?: "h1" | "h2" | "h3";
  align?: "center" | "start";
  /** "md" for full-page states (404, errors), "sm" inside drawers and lists. */
  size?: "sm" | "md";
  id?: string;
  className?: string;
}

/**
 * Typographic system state for empty lists, 404s and errors. The brand voice does
 * the work instead of an illustration: eyebrow, a serif line, a quiet explanation
 * and a clear next step.
 *
 * Type classes are joined as plain strings, not through cn(): tailwind-merge does not
 * know the custom type scale and would drop a size that sits beside a colour.
 */
export function EmptyState({
  eyebrow,
  title,
  body,
  actions,
  children,
  as: Heading = "h2",
  align = "center",
  size = "md",
  id,
  className,
}: EmptyStateProps) {
  const centred = align === "center";
  const md = size === "md";
  const bodyClassName = `max-w-md text-muted-foreground ${md ? "mt-6 text-body" : "mt-4 text-body-sm"}`;

  return (
    <div className={cn("flex flex-col", centred ? "items-center text-center" : "items-start text-left", className)}>
      {eyebrow ? (
        <p className={`text-eyebrow text-muted-foreground ${md ? "mb-5" : "mb-3"}`}>{eyebrow}</p>
      ) : null}
      <Heading id={id} className={`max-w-[18ch] font-display ${md ? "text-display-md" : "text-display-sm"}`}>
        <Emphasis text={title} />
      </Heading>
      {body ? (
        typeof body === "string" ? (
          <p className={bodyClassName}>{body}</p>
        ) : (
          <div className={bodyClassName}>{body}</div>
        )
      ) : null}
      {actions ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-8 gap-y-5",
            md ? "mt-10" : "mt-8",
            centred && "justify-center",
          )}
        >
          {actions}
        </div>
      ) : null}
      {children ? <div className={cn("w-full", md ? "mt-12" : "mt-8")}>{children}</div> : null}
    </div>
  );
}
