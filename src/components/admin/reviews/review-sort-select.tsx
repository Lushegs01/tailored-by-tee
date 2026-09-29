"use client";

import { useId, useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SelectChevron, adminSelectClassName } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

import { REVIEW_SORT_OPTIONS } from "./review-rules";

/**
 * The review list's order (newest first by default), kept in the URL like the
 * search and filters: choosing one replaces ?sort=&dir= and goes back to page 1.
 */
export function ReviewSortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value);
  const id = useId();

  function choose(next: string) {
    const [sort, dir] = next.split(":");
    const params = new URLSearchParams(searchParams.toString());
    if (next === REVIEW_SORT_OPTIONS[0].value) {
      params.delete("sort");
      params.delete("dir");
    } else {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      setShown(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="relative w-full sm:w-auto">
      <label htmlFor={id} className="sr-only">
        Order reviews by
      </label>
      <select
        id={id}
        value={shown}
        onChange={(event) => choose(event.target.value)}
        className={cn(adminSelectClassName, "sm:w-auto sm:min-w-48")}
      >
        {REVIEW_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <SelectChevron />
    </div>
  );
}
