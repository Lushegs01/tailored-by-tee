import type { ReactNode } from "react";

import { TextLink } from "@/components/ui/text-link";
import { cn } from "@/lib/utils";

export interface AccountSectionProps {
  /** Prefix for the heading id the section is labelled by. */
  id: string;
  title: string;
  /** The way onward, set after the content. `ariaLabel` must contain the visible label. */
  action?: { label: string; href: string; ariaLabel?: string };
  children: ReactNode;
  className?: string;
}

/** One block of an account page: a hairline, a small-caps heading, the content, then a quiet link. */
export function AccountSection({ id, title, action, children, className }: AccountSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section aria-labelledby={headingId} className={cn("border-t pt-6", className)}>
      <h2 id={headingId} className="text-label">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
      {action ? (
        <TextLink href={action.href} aria-label={action.ariaLabel} className="mt-6">
          {action.label}
        </TextLink>
      ) : null}
    </section>
  );
}
