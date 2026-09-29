"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/*
 * What the customer wrote, exactly as they wrote it: line breaks kept, long words
 * and addresses wrapped, never turned into links. A long review starts folded to
 * a few lines with "Show the full review"; the whole text is always in the page,
 * so screen readers and in-page search read all of it.
 */

export function ReviewBody({ body, long }: { body: string; long: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = body.trim();

  if (!text) return <p className="text-body-sm text-muted-foreground italic">No text, just a rating.</p>;

  return (
    <div>
      <p
        id={id}
        className={cn(
          "text-body-sm [overflow-wrap:anywhere] whitespace-pre-line",
          long && !open && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((current) => !current)}
          className="mt-1 inline-flex min-h-10 items-center text-body-sm text-foreground"
        >
          <span className="link-underline-static pb-0.5">{open ? "Show less" : "Show the full review"}</span>
        </button>
      ) : null}
    </div>
  );
}
