import Link from "next/link";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { listingHref, type ListingParams } from "@/lib/catalog/listing-params";

export interface ListingPaginationProps {
  basePath: string;
  params: ListingParams;
  total: number;
  pageSize: number;
}

/** 1 … 4 5 6 … 10: first, last and the neighbours of the current page. */
function pageWindow(current: number, last: number): (number | "gap")[] {
  const pages = new Set([1, last, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= last).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ["gap" as const, page] : [page]));
}

const edgeLink = "inline-flex min-h-11 items-center gap-2 text-label transition-opacity duration-300 hover:opacity-60";

/** Plain links, so every page is crawlable and works without JavaScript. */
export function ListingPagination({ basePath, params, total, pageSize }: ListingPaginationProps) {
  const last = Math.ceil(total / pageSize);
  if (last <= 1) return null;

  const current = Math.min(params.page, last);
  const href = (page: number) => listingHref(basePath, { ...params, page });

  return (
    <nav aria-label="Pagination" className="mt-16 flex items-center justify-between gap-6 border-t pt-4 md:mt-20">
      {current > 1 ? (
        <Link href={href(current - 1)} rel="prev" className={edgeLink}>
          <ChevronLeftIcon aria-hidden="true" className="text-base" />
          Previous
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <ol className="hidden items-center gap-1 md:flex">
        {pageWindow(current, last).map((page, index) =>
          page === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-2 text-caption text-muted-foreground">
              …
            </li>
          ) : (
            <li key={page}>
              <Link
                href={href(page)}
                aria-current={page === current ? "page" : undefined}
                className="grid size-11 place-items-center border border-transparent text-caption tabular-nums transition-colors duration-300 hover:border-border-strong aria-[current=page]:border-foreground"
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
          <ChevronRightIcon aria-hidden="true" className="text-base" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
