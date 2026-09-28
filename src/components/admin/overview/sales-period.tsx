"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useOptimistic, useTransition, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Switching the sales period (or between real and test sales) is a navigation to
 * /admin?period=…; the server renders the new figures. While it loads, the switch
 * shows the new choice at once and the figures below stay in place, dimmed,
 * instead of blanking into a skeleton. Every control is a real link, so it also
 * works before JavaScript loads, in a new tab, and with the keyboard. The links
 * don't prefetch: the page is rendered per request, so a prefetch would only
 * repeat the admin check and the queries for a period the owner may never pick.
 */

interface SalesNavigation {
  pending: boolean;
  /** The period being shown, or the one being loaded. */
  period: string;
  go(href: string, period?: string): void;
}

const SalesNavigationContext = createContext<SalesNavigation | null>(null);

export function SalesPeriodProvider({ period, children }: { period: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticPeriod, setOptimisticPeriod] = useOptimistic(period);

  function go(href: string, nextPeriod?: string) {
    startTransition(() => {
      if (nextPeriod) setOptimisticPeriod(nextPeriod);
      router.push(href, { scroll: false });
    });
  }

  return <SalesNavigationContext value={{ pending, period: optimisticPeriod, go }}>{children}</SalesNavigationContext>;
}

/** A plain left click without modifier keys: anything else (new tab, new window) is left to the browser. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export interface PeriodSwitchOption {
  value: string;
  label: string;
  href: string;
}

/** Today / 7 days / 30 days / 90 days, as a row of links; the current one is marked for screen readers too. */
export function PeriodSwitch({ options, className }: { options: PeriodSwitchOption[]; className?: string }) {
  const navigation = use(SalesNavigationContext);

  return (
    <nav aria-label="Sales period" className={cn("min-w-0", className)}>
      <ul className="grid grid-cols-4 border sm:inline-grid">
        {options.map((option) => {
          const current = option.value === navigation?.period;
          return (
            <li key={option.value} className="border-l first:border-l-0">
              <Link
                href={option.href}
                scroll={false}
                prefetch={false}
                aria-current={current ? "page" : undefined}
                onClick={(event) => {
                  if (!navigation || !isPlainClick(event)) return;
                  event.preventDefault();
                  if (!current) navigation.go(option.href, option.value);
                }}
                className={cn(
                  "flex min-h-10 items-center justify-center px-3 text-body-sm whitespace-nowrap transition-colors duration-200",
                  "focus-visible:-outline-offset-4",
                  current
                    ? "bg-surface-strong font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A link that reloads the sales figures the same way (e.g. "View test sales"). */
export function SalesLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const navigation = use(SalesNavigationContext);

  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      onClick={(event) => {
        if (!navigation || !isPlainClick(event)) return;
        event.preventDefault();
        navigation.go(href);
      }}
      className={cn("inline-flex min-h-10 items-center text-body-sm whitespace-nowrap text-foreground", className)}
    >
      <span className="link-underline-static pb-0.5">{children}</span>
    </Link>
  );
}

/** Wraps the figures: dims them (and marks them busy) while a new period loads. */
export function SalesPendingArea({ className, children }: { className?: string; children: ReactNode }) {
  const pending = use(SalesNavigationContext)?.pending ?? false;

  return (
    <div
      aria-busy={pending || undefined}
      className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50", className)}
    >
      {children}
    </div>
  );
}
