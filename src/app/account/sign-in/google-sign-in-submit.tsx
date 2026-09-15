"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * The "Continue with Google" button. Says it is working while the action hands
 * over to Google, and ignores a second press meanwhile — aria-disabled rather
 * than disabled, so keyboard focus stays on it.
 */
export function GoogleSignInSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      size="lg"
      fullWidth
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {pending ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}
