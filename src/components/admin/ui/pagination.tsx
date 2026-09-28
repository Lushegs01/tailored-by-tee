import Link from "next/link";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { PAGE_SIZE, buildListHref, lastPage, pageRange, type ListParams } from "@/lib/admin/pagination";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  /** The list's path, e.g. "/admin/orders". */
  base: string;
  params: ListParams;
  total: number;
  pageSize?: number;
  /** What the rows are: "orders" or { one: "order", other: "orders" }. Default "results". */
  noun?: string | { one: string; other: string };
  className?: string;
}

/** 1 … 4 5 6 … 10: first, last and the neighbours of the current page. */
function pageWindow(current: number, last: number): (number | "gap")[] {
  const pages = [...new Set([1, last, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= last)
    .sort((a, b) => a - b);
  return pages.flatMap((page, index) => (index > 0 && page - pages[index - 1] > 1 ? ["gap" as const, page] : [page]));
}

const edgeLink =
  "inline-flex min-h-10 items-center gap-1.5 px-2 text-label transition-opacity duration-200 hover:opacity-60";

/**
 * "Showing 26–50 of 213 orders", with Previous/Next (and page numbers from md).
 * Server-rendered plain links built with buildListHref, so the search, filters and
 * sort carry through. Renders nothing when the list is empty.
 */
export function Pagination({ base, params, total, pageSize = PAGE_SIZE, noun = "results", className }: PaginationProps) {
  if (total <= 0) return null;

  const last = lastPage(total, pageSize);
  const current = Math.min(Math.max(1, params.page), last);
  const { from, to } = pageRange(current, total, pageSize);
  const word = typeof noun === "string" ? noun : total === 1 ? noun.one : noun.other;
  const href = (page: number) => buildListHref(base, params, { page });
  const count = new Intl.NumberFormat("en-NG");

  return (
    <div
      className={cn(
        "flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <p className="text-caption tabular-nums text-muted-foreground">
        Showing {count.format(from)}–{count.format(to)} of {count.format(total)} {word}
      </p>

      {last > 1 ? (
        <nav aria-label="Pagination" className="-mx-2 flex items-center justify-between gap-2 sm:justify-end">
          {current > 1 ? (
            <Link href={href(current - 1)} rel="prev" className={edgeLink}>
              <ChevronLeftIcon className="text-base" />
              Previous
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(edgeLink, "pointer-events-none opacity-30")}>
              <ChevronLeftIcon className="text-base" />
              Previous
            </span>
          )}

          <ol className="hidden items-center md:flex">
            {pageWindow(current, last).map((page, index) =>
              page === "gap" ? (
                <li key={`gap-${index}`} aria-hidden="true" className="px-1.5 text-caption text-muted-foreground">
                  …
                </li>
              ) : (
                <li key={page}>
                  <Link
                    href={href(page)}
                    aria-current={page === current ? "page" : undefined}
                    className="grid h-9 min-w-9 place-items-center border border-transparent px-1.5 text-caption tabular-nums transition-colors hover:border-border-strong aria-[current=page]:border-foreground"
                  >
                    <span className="sr-only">Page </span>
                    {page}
                  </Link>
                </li>
              ),
            )}
          </ol>
          <p className="text-caption tabular-nums text-muted-foreground md:hidden">
            Page {current} of {last}
          </p>

          {current < last ? (
            <Link href={href(current + 1)} rel="next" className={edgeLink}>
              Next
              <ChevronRightIcon className="text-base" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(edgeLink, "pointer-events-none opacity-30")}>
              Next
              <ChevronRightIcon className="text-base" />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
