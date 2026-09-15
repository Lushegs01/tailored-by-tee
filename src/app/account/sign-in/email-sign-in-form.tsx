"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { signInWithEmail, type EmailSignInState } from "./actions";

const INITIAL: EmailSignInState = { status: "idle" };

/** Email field + "Email me a sign-in link". Works without JavaScript (a plain form post). */
export function EmailSignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = React.useActionState(signInWithEmail, INITIAL);
  const errorId = React.useId();

  return (
    <form action={action} noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Label htmlFor="sign-in-email">Email</Label>
      <Input
        id="sign-in-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={state.email}
        aria-invalid={state.status === "error" || undefined}
        aria-describedby={state.status === "error" ? errorId : undefined}
      />
      {state.status === "error" && state.message ? (
        <p id={errorId} role="alert" className="mt-2 text-caption text-danger">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" fullWidth size="lg" disabled={pending} aria-busy={pending || undefined} className="mt-5">
        {pending ? "Sending your link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
