"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon, CloseIcon } from "@/components/icons";

/*
 * The inventory page's confirmation line. A stock dialog closes as soon as its
 * change is saved (so the owner can move straight to the next row); the result
 * then shows here, in one polite live region for the whole page that screen
 * readers announce, and stays until it's dismissed, replaced or ten seconds pass.
 */

type Announce = (message: string) => void;

const FeedbackContext = createContext<Announce>(() => {});

/** Announce a saved change from inside an InventoryFeedbackProvider. */
export function useInventoryFeedback(): Announce {
  return useContext(FeedbackContext);
}

const VISIBLE_MS = 10_000;

export function InventoryFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback<Announce>((text) => {
    clearTimeout(timer.current);
    setMessage({ text, id: Date.now() });
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
              className="pointer-events-auto flex items-start gap-3 border border-foreground bg-foreground py-3 pr-1 pl-4 text-body-sm text-background transition-opacity duration-300 starting:opacity-0"
            >
              <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />
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
