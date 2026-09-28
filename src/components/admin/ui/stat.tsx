import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface StatDelta {
  /** e.g. "12% on last week" */
  label: string;
  direction: "up" | "down" | "flat";
  /** Whether the change is good news. Default: neutral. */
  tone?: "positive" | "critical" | "neutral";
}

export interface StatProps {
  label: string;
  /** Already formatted, e.g. formatKobo(total) or "14". */
  value: ReactNode;
  delta?: StatDelta;
  /** A quiet line under the value, e.g. "Paid orders, last 7 days". */
  hint?: ReactNode;
  /** Makes the whole figure a link to the list behind it. */
  href?: string;
  className?: string;
}

const DELTA_TONES = {
  positive: "text-success",
  critical: "text-danger",
  neutral: "text-muted-foreground",
} as const;

const DIRECTION_WORDS = { up: "Up", down: "Down", flat: "No change" } as const;
const DIRECTION_GLYPHS = { up: "↑", down: "↓", flat: "→" } as const;

/** Grid of Stat figures (a <dl>). Hairlines between cells; 2 across on phones, up to 4 from lg. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-px border bg-border min-[380px]:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** One headline figure. Must sit inside StatGrid (it renders <dt>/<dd>). */
export function Stat({ label, value, delta, hint, href, className }: StatProps) {
  const figure = <span className="block text-2xl font-medium tracking-tight tabular-nums break-words">{value}</span>;

  return (
    <div className={cn("relative flex min-w-0 flex-col bg-background-raised p-4", href && "hover:bg-surface/60", className)}>
      <dt className="text-eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-2">
        {href ? (
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-[1.5px] focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
          >
            {figure}
          </Link>
        ) : (
          figure
        )}
      </dd>
      {delta ? (
        <dd className={cn("mt-1 text-caption tabular-nums", DELTA_TONES[delta.tone ?? "neutral"])}>
          <span aria-hidden="true">{DIRECTION_GLYPHS[delta.direction]} </span>
          <span className="sr-only">{DIRECTION_WORDS[delta.direction]}: </span>
          {delta.label}
        </dd>
      ) : null}
      {hint ? <dd className="mt-1 text-caption text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}
