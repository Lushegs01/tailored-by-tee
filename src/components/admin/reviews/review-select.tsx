"use client";

import { useEffect, useId, useRef } from "react";

import { useReviewModeration } from "./review-moderation-provider";

/*
 * Ticking reviews for a bulk step: a box on each review, and "Select all on this
 * page" above the list (mixed when only some are ticked).
 */

const checkboxClassName = "size-4 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed";

/** The tick box on one review. Its label is read by screen readers only. */
export function ReviewSelectBox({ id, label }: { id: string; label: string }) {
  const { isSelected, toggle } = useReviewModeration();
  const inputId = useId();

  return (
    // A 40px target around the 16px box.
    <label htmlFor={inputId} className="-m-3 inline-flex cursor-pointer p-3">
      <input
        id={inputId}
        type="checkbox"
        checked={isSelected(id)}
        onChange={(event) => toggle(id, event.target.checked)}
        className={checkboxClassName}
      />
      <span className="sr-only">Select {label}</span>
    </label>
  );
}

/** "Select all on this page", with how many are ticked. */
export function ReviewSelectAll() {
  const { items, selected, selectAll } = useReviewModeration();
  const ref = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const all = items.length > 0 && selected.length === items.length;
  const some = selected.length > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1">
      <label
        htmlFor={inputId}
        className="-my-2 -ml-3 inline-flex cursor-pointer items-center gap-3 py-2 pl-3 text-body-sm"
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          checked={all}
          disabled={items.length === 0}
          onChange={() => selectAll(!all)}
          className={checkboxClassName}
        />
        Select all on this page
      </label>
      <p aria-live="polite" className="text-caption text-muted-foreground tabular-nums">
        {selected.length > 0 ? `${selected.length} of ${items.length} selected` : ""}
      </p>
    </div>
  );
}
