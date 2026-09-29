"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ChevronDownIcon } from "@/components/icons";
import type { AdminActionResult } from "@/lib/admin/auth";
import type { ReorderOutcome } from "@/lib/admin/collections";
import { cn } from "@/lib/utils";

import type { MoveDirection } from "./ordering";

export interface ReorderButtonsProps {
  /** The item's name for the buttons' labels: "Move Harmattan up". */
  itemName: string;
  /** 0-based position in the list as currently shown. */
  index: number;
  count: number;
  /**
   * Performs the move. From a server component pass a bound server action
   * (moveCollectionAction.bind(null, id)); from a client component, a closure.
   */
  move: (direction: MoveDirection) => Promise<AdminActionResult<ReorderOutcome>>;
  /** Words for the directions, e.g. "earlier"/"later" for photos. Default "up"/"down". */
  labels?: { up: string; down: string };
  className?: string;
}

const CONTROL =
  "inline-flex size-9 items-center justify-center border border-border-strong text-base text-foreground transition-colors hover:bg-surface focus-visible:outline-[1.5px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-30 aria-disabled:cursor-progress aria-disabled:opacity-60";

/**
 * "Move up" / "Move down" for one row of an ordered list. The server works out
 * the new order from the database; this only asks. While a move is saving the
 * buttons stay focusable but inert (aria-disabled), so keyboard focus isn't lost;
 * after the list re-renders, focus returns to the same button (or the other one
 * when the row reached an end), and the new position is read out.
 */
export function ReorderButtons({ itemName, index, count, move, labels, className }: ReorderButtonsProps) {
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<MoveDirection | null>(null);
  const words = labels ?? { up: "up", down: "down" };

  const canUp = index > 0;
  const canDown = index < count - 1;

  // Once the list has re-rendered with the new position, put focus back.
  useEffect(() => {
    const wanted = restoreFocus.current;
    if (!wanted) return;
    restoreFocus.current = null;
    const same = wanted === "up" ? canUp : canDown;
    const target = wanted === "up" ? (same ? upRef : downRef) : same ? downRef : upRef;
    target.current?.focus();
  }, [index, count, canUp, canDown]);

  function run(direction: MoveDirection) {
    if (pending) return;
    const hadFocus =
      document.activeElement === upRef.current || document.activeElement === downRef.current;
    setError(null);
    startTransition(async () => {
      let result: AdminActionResult<ReorderOutcome>;
      try {
        result = await move(direction);
      } catch {
        result = { ok: false, message: "That didn’t save. Refresh the page and try again." };
      }
      if (!result.ok) {
        setError(result.message);
        setAnnouncement("");
        return;
      }
      if (hadFocus) restoreFocus.current = direction;
      setAnnouncement(
        result.message ??
          `Moved ${itemName} ${direction === "up" ? words.up : words.down}: now ${result.data.position} of ${result.data.count}.`,
      );
    });
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="flex items-center gap-1.5" aria-busy={pending || undefined}>
        <button
          ref={upRef}
          type="button"
          className={CONTROL}
          disabled={!canUp}
          aria-disabled={pending || undefined}
          aria-label={`Move ${itemName} ${words.up}`}
          title={`Move ${words.up}`}
          onClick={() => run("up")}
        >
          <ChevronDownIcon aria-hidden="true" className="rotate-180" />
        </button>
        <button
          ref={downRef}
          type="button"
          className={CONTROL}
          disabled={!canDown}
          aria-disabled={pending || undefined}
          aria-label={`Move ${itemName} ${words.down}`}
          title={`Move ${words.down}`}
          onClick={() => run("down")}
        >
          <ChevronDownIcon aria-hidden="true" />
        </button>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {/* Narrow on phones: this sits in a shrink-0 column, so its width sets the row's. */}
      {error ? (
        <p role="alert" className="max-w-36 text-right text-caption text-danger sm:max-w-56">
          {error}
        </p>
      ) : null}
    </div>
  );
}
