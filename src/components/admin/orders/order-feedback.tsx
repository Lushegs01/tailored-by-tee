"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/*
 * The order page's confirmation line. A dialog closes as soon as its step is
 * saved, so the owner can carry straight on; what happened then shows here, in
 * one polite live region for the whole page that screen readers announce, and
 * stays until it's dismissed, replaced, or twelve seconds pass.
 *
 * Refunds and payment checks can end in something that isn't simply "done" — a
 * refund the bank still has, a payment Paystack says failed — so the line has a
 * quieter "note" tone as well as the plain confirmation.
 */

export type FeedbackTone = "done" | "note";

type Announce = (message: string, tone?: FeedbackTone) => void;

const FeedbackContext = createContext<Announce>(() => {});

/** Announce a finished step from inside an OrderFeedbackProvider. */
export function useOrderFeedback(): Announce {
  return useContext(FeedbackContext);
}

const VISIBLE_MS = 12_000;

export function OrderFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; tone: FeedbackTone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A counter, not the clock: two steps in the same millisecond must still each
  // remount the live region, or the second goes unannounced.
  const sequence = useRef(0);

  const announce = useCallback<Announce>((text, tone = "done") => {
    clearTimeout(timer.current);
    sequence.current += 1;
    setMessage({ text, tone, id: sequence.current });
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  function dismiss() {
    clearTimeout(timer.current);
    setMessage(null);
  }

  return (
    <FeedbackContext.Provider value={announce}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end md:inset-x-8">
        {/* Always present, so each new message is announced. */}
        <div role="status" aria-live="polite" className="w-full max-w-md">
          {message ? (
            <div
              key={message.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 border py-3 pr-1 pl-4 text-body-sm transition-opacity duration-300 starting:opacity-0",
                message.tone === "done"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-strong bg-background-raised text-foreground",
              )}
            >
              {message.tone === "done" ? (
                <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />
              ) : null}
              <p className="min-w-0 flex-1 py-px break-words">{message.text}</p>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss message"
                title="Dismiss"
                className="-my-2 inline-flex size-10 shrink-0 items-center justify-center text-base transition-opacity hover:opacity-70"
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </FeedbackContext.Provider>
  );
}
