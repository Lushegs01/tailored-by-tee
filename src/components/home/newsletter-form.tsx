"use client";

import Link from "next/link";
import { useActionState, useId, type FormEvent } from "react";

import { subscribeToNewsletter, type NewsletterState } from "@/app/actions/newsletter";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";

const initialState: NewsletterState = { status: "idle", message: "" };

/** Stable ref callback: focuses the confirmation once, when it replaces the form. */
const focusOnMount = (node: HTMLElement | null) => {
  node?.focus();
};

/**
 * Single-field sign-up. Messages are styled inline rather than left to browser
 * bubbles, and a successful sign-up replaces the form with a quiet confirmation
 * that takes focus, so keyboard and screen-reader users land on the outcome.
 *
 * The band this sits on (bg-surface) is a shade darker than paper, so secondary
 * text uses foreground at reduced opacity — stone would fall just short of 4.5:1.
 */
export function NewsletterForm() {
  const [state, formAction, pending] = useActionState(subscribeToNewsletter, initialState);
  const id = useId();
  const emailId = `${id}-email`;
  const errorId = `${id}-error`;
  const consentId = `${id}-consent`;
  const hasError = state.status === "error";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Ignore repeat submits while the first is in flight.
    if (pending) event.preventDefault();
  }

  if (state.status === "success") {
    return (
      <div role="status" className="border-b border-foreground/50 pb-4">
        <p
          ref={focusOnMount}
          tabIndex={-1}
          className="flex items-center gap-3 text-body outline-none"
        >
          <CheckIcon aria-hidden="true" className="shrink-0 text-lg" />
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="min-w-0 flex-1">
          <label htmlFor={emailId} className="sr-only">
            Email address
          </label>
          <Input
            id={emailId}
            name="email"
            type="email"
            variant="underline"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            maxLength={254}
            placeholder="Your email address"
            defaultValue={state.email}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : undefined}
            className="border-foreground/50 placeholder:text-foreground/65"
          />
        </div>
        <Button type="submit" variant="outline" aria-disabled={pending || undefined}>
          {pending ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>

      {hasError ? <FieldError id={errorId}>{state.message}</FieldError> : null}

      {/* Honeypot: off-screen, out of the tab order and hidden from assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Leave this field empty</label>
        <input id={`${id}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <p id={consentId} className="mt-5 text-caption text-foreground/75">
        By subscribing you agree to our{" "}
        <Link
          href="/privacy"
          className="text-foreground underline decoration-1 underline-offset-[3px] transition-colors duration-300 hover:decoration-transparent"
        >
          Privacy Policy
        </Link>
        . Unsubscribe at any time.
      </p>
    </form>
  );
}
