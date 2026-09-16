"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";

import { signInWithEmail, type EmailSignInState } from "./actions";

const INITIAL: EmailSignInState = { status: "idle" };

/**
 * Email field + "Email me a sign-in link". Works without JavaScript (a plain form
 * post). Only a problem with the address marks the field invalid; anything else
 * (too many links, a failed send) is a message above it. Either way focus comes
 * back to the field, since the disabled button lets it go while sending.
 */
export function EmailSignInForm({ callbackUrl, linkLifetime }: { callbackUrl: string; linkLifetime: string }) {
  const [state, action, pending] = React.useActionState(signInWithEmail, INITIAL);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const errorId = React.useId();
  const hintId = React.useId();
  const fieldError = state.status === "error" && state.field === "email";

  React.useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {state.status === "error" && state.message && !fieldError ? (
        <p role="alert" className="mb-6 border border-danger/40 px-4 py-3 text-body-sm">
          {state.message}
        </p>
      ) : null}
      <Label htmlFor="sign-in-email">Email</Label>
      <Input
        ref={inputRef}
        id="sign-in-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={state.email}
        aria-invalid={fieldError || undefined}
        aria-describedby={fieldError ? `${errorId} ${hintId}` : hintId}
      />
      {fieldError && state.message ? (
        <p id={errorId} role="alert" className="mt-2 text-caption text-danger">
          {state.message}
        </p>
      ) : null}
      <FieldHint id={hintId}>
        We&rsquo;ll email you a link that signs you in. It works once and expires after {linkLifetime}.
      </FieldHint>
      <Button type="submit" fullWidth size="lg" disabled={pending} aria-busy={pending || undefined} className="mt-5">
        {pending ? "Sending your link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
