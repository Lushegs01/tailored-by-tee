"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CheckIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

import { REVIEW_LIST_HEADING_ID, reviewElementId, type ReviewStatusValue } from "./review-rules";

/*
 * The client side of the review list: which reviews are ticked for a bulk step,
 * the page's confirmation line (with "Undo" after a single step), and where focus
 * goes when the control it was on leaves the page.
 *
 * The server renders the list; this only holds what the browser needs between
 * renders. After every change the server re-renders the page, and ticks for
 * reviews that have left the page are forgotten.
 */

/** A review on this page, as the browser needs it. */
export interface ReviewItem {
  id: string;
  status: ReviewStatusValue;
  isDemo: boolean;
  /** "Ada’s review of Linen Shirt" */
  label: string;
}

export interface FeedbackMessage {
  text: string;
  tone: "success" | "error";
  /** Offered after a single step, e.g. to put an approved review back. */
  undo?: () => void;
}

interface ReviewModerationContext {
  items: readonly ReviewItem[];
  /** The ticked reviews on this page, in page order, with their current status. */
  selected: readonly ReviewItem[];
  isSelected: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  selectAll: (on: boolean) => void;
  clearSelection: () => void;
  announce: (message: FeedbackMessage) => void;
  /**
   * After a step on one review: if focus is lost (its card left the list, or the
   * pressed button was replaced), move it to that review, else the next one, else
   * the list heading.
   */
  restoreFocusNear: (id: string) => void;
  /** After a bulk step: if focus is lost (the bulk bar closed), move it to the list heading. */
  restoreFocusToList: () => void;
}

const Context = createContext<ReviewModerationContext | null>(null);

export function useReviewModeration(): ReviewModerationContext {
  const context = useContext(Context);
  if (!context) throw new Error("useReviewModeration must be used inside ReviewModerationProvider.");
  return context;
}

const VISIBLE_MS = 10_000;
const UNDO_VISIBLE_MS = 15_000;
/** Long enough for a dialog's closing animation and the list's re-render. */
const FOCUS_WATCH_MS = 1_500;
const FOCUS_WATCH_STEP_MS = 100;

function focusIsLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

export function ReviewModerationProvider({
  items,
  children,
}: {
  items: readonly ReviewItem[];
  children: ReactNode;
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [message, setMessage] = useState<(FeedbackMessage & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const watcher = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Counts announcements rather than timing them: two steps in the same
  // millisecond, or the same sentence twice running, still remount the live
  // region, so a screen reader reads every one of them.
  const announced = useRef(0);

  // When the list changes (a step, another page, a filter), forget ticks for
  // reviews that are no longer on it, so they don't come back ticked later.
  const [seenItems, setSeenItems] = useState(items);
  if (seenItems !== items) {
    setSeenItems(items);
    const onPage = new Set(items.map((item) => item.id));
    if ([...ticked].some((id) => !onPage.has(id))) {
      setTicked(new Set([...ticked].filter((id) => onPage.has(id))));
    }
  }

  const selected = useMemo(() => items.filter((item) => ticked.has(item.id)), [items, ticked]);

  const isSelected = useCallback((id: string) => ticked.has(id), [ticked]);

  const toggle = useCallback((id: string, on: boolean) => {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (on: boolean) => setTicked(on ? new Set(items.map((item) => item.id)) : new Set()),
    [items],
  );

  const clearSelection = useCallback(() => setTicked(new Set()), []);

  const announce = useCallback((next: FeedbackMessage) => {
    clearTimeout(timer.current);
    announced.current += 1;
    setMessage({ ...next, key: announced.current });
    timer.current = setTimeout(() => setMessage(null), next.undo ? UNDO_VISIBLE_MS : VISIBLE_MS);
  }, []);

  /**
   * For a short while, if focus falls back to the page body (its element was
   * removed), move it to the first of `reviewIds` still on the page, or the list
   * heading. Never takes focus from anything the admin has moved to.
   */
  const watchFocus = useCallback((reviewIds: readonly string[]) => {
    clearInterval(watcher.current);
    const started = Date.now();
    watcher.current = setInterval(() => {
      if (focusIsLost()) {
        const target =
          reviewIds.map((id) => document.getElementById(reviewElementId(id))).find(Boolean) ??
          document.getElementById(REVIEW_LIST_HEADING_ID);
        target?.focus();
        clearInterval(watcher.current);
        return;
      }
      if (Date.now() - started > FOCUS_WATCH_MS) clearInterval(watcher.current);
    }, FOCUS_WATCH_STEP_MS);
  }, []);

  const restoreFocusNear = useCallback(
    (id: string) => {
      const index = items.findIndex((item) => item.id === id);
      const after = index === -1 ? [] : items.slice(index + 1).map((item) => item.id);
      const before =
        index === -1
          ? []
          : items
              .slice(0, index)
              .map((item) => item.id)
              .reverse();
      watchFocus([id, ...after, ...before]);
    },
    [items, watchFocus],
  );

  const restoreFocusToList = useCallback(() => watchFocus([]), [watchFocus]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearInterval(watcher.current);
    },
    [],
  );

  function dismiss() {
    clearTimeout(timer.current);
    setMessage(null);
  }

  const value = useMemo<ReviewModerationContext>(
    () => ({
      items,
      selected,
      isSelected,
      toggle,
      selectAll,
      clearSelection,
      announce,
      restoreFocusNear,
      restoreFocusToList,
    }),
    [
      items,
      selected,
      isSelected,
      toggle,
      selectAll,
      clearSelection,
      announce,
      restoreFocusNear,
      restoreFocusToList,
    ],
  );

  const success = message?.tone === "success" ? message : null;
  const failure = message?.tone === "error" ? message : null;

  return (
    <Context.Provider value={value}>
      {children}

      <div
        className={cn(
          "pointer-events-none fixed inset-x-4 z-40 flex justify-end md:inset-x-8",
          // Clear of the bulk bar while reviews are ticked.
          selected.length > 0 ? "bottom-44 sm:bottom-32 lg:bottom-20" : "bottom-4",
        )}
      >
        <div className="w-full max-w-md">
          {/* Both regions are always present, so each new message is announced. */}
          <div role="status" aria-live="polite">
            {success ? <Toast key={success.key} message={success} onDismiss={dismiss} /> : null}
          </div>
          <div role="alert">
            {failure ? <Toast key={failure.key} message={failure} onDismiss={dismiss} /> : null}
          </div>
        </div>
      </div>
    </Context.Provider>
  );
}

function Toast({ message, onDismiss }: { message: FeedbackMessage; onDismiss: () => void }) {
  const error = message.tone === "error";
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 border py-3 pr-1 pl-4 text-body-sm transition-opacity duration-300 starting:opacity-0",
        error
          ? "border-danger bg-background-raised text-danger"
          : "border-foreground bg-foreground text-background",
      )}
    >
      {error ? null : <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />}
      <p className="min-w-0 flex-1 py-px break-words">{message.text}</p>
      {message.undo ? (
        <button
          type="button"
          onClick={() => {
            onDismiss();
            message.undo?.();
          }}
          className="-my-2 inline-flex min-h-10 shrink-0 items-center px-2 text-label underline underline-offset-4 transition-opacity hover:opacity-70"
        >
          Undo
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        title="Dismiss"
        className="-my-2 inline-flex size-10 shrink-0 items-center justify-center text-base transition-opacity hover:opacity-70"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
