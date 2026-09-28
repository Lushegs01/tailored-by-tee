"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/*
 * The confirmation line for discount pages: "WELCOME10 is switched off", "Discount
 * created". One polite live region per page (always present, so each new message
 * is announced), shown at the foot of the screen until it's dismissed, replaced
 * or twelve seconds pass. Errors stay until dismissed.
 */

type Tone = "success" | "error";
type Announce = (message: string, tone?: Tone) => void;

const FeedbackContext = createContext<Announce>(() => {});

/** Show a message from inside a DiscountFeedbackProvider. */
export function useDiscountFeedback(): Announce {
  return useContext(FeedbackContext);
}

const VISIBLE_MS = 12_000;

export function DiscountFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback<Announce>((text, tone = "success") => {
    clearTimeout(timer.current);
    setMessage({ text, tone, id: Date.now() });
    if (tone === "success") timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
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
        <div role="status" aria-live="polite" className="w-full max-w-md">
          {message ? (
            <div
              key={message.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 border py-3 pr-1 pl-4 text-body-sm transition-opacity duration-300 starting:opacity-0",
                message.tone === "success"
                  ? "border-foreground bg-foreground text-background"
                  : "border-danger bg-background-raised text-danger",
              )}
            >
              {message.tone === "success" ? (
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

/**
 * A message carried over from the previous page in the URL (?saved=created,
 * ?deleted=CODE): shown once, then those parameters are taken out of the address
 * so a refresh or a shared link doesn't repeat it.
 */
export function DiscountFlash({ message, clearParams }: { message: string | null; clearParams: readonly string[] }) {
  const announce = useDiscountFeedback();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!message || shown.current === message) return;
    shown.current = message;
    announce(message);

    const url = new URL(window.location.href);
    let changed = false;
    for (const name of clearParams) {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }
    // Next's router follows native replaceState (and keeps useSearchParams in step).
    if (changed) window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [announce, clearParams, message]);

  return null;
}
