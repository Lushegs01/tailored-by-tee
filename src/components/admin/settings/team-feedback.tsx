"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon } from "@/components/icons";

/*
 * Feedback for changes that remove the control that made them. Removing someone's
 * admin access takes their row (and its button and dialog) off the page, so the
 * confirmation can't live in the row: rows report success here instead. The
 * message appears above the list and takes focus, so keyboard and screen-reader
 * users land on it rather than at the top of the page.
 */

type Report = (message: string) => void;

const TeamFeedbackContext = createContext<Report | null>(null);

/** Reports a success message to the surrounding TeamFeedback. */
export function useTeamFeedback(): Report {
  const report = useContext(TeamFeedbackContext);
  return report ?? noop;
}

function noop() {}

export function TeamFeedback({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<{ message: string; key: number } | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  const report = useCallback<Report>((message) => {
    setFeedback((previous) => ({ message, key: (previous?.key ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!feedback) return;
    // After the dialog has closed and tried to return focus to its (removed) trigger.
    const timer = window.setTimeout(() => messageRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  return (
    <TeamFeedbackContext.Provider value={report}>
      {feedback ? (
        <p
          key={feedback.key}
          ref={messageRef}
          tabIndex={-1}
          className="flex items-start gap-2 border-b px-4 py-3 text-body-sm text-success outline-none focus-visible:outline focus-visible:outline-[1.5px] focus-visible:-outline-offset-2 focus-visible:outline-ring md:px-5"
        >
          <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />
          <span>{feedback.message}</span>
        </p>
      ) : null}
      {children}
    </TeamFeedbackContext.Provider>
  );
}
