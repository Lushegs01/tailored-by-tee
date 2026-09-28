"use client";

import { useRef, useState, type FormEvent } from "react";

import { grantAdminAccess } from "@/app/admin/settings/actions";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";
import { TextField } from "@/components/admin/ui/fields";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

// The same rule the server applies is stricter (zod's email check); this only
// catches obvious slips before the confirmation opens.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Give someone admin access": an email field, then a confirmation that shows
 * the exact address, because whoever can sign in with it gets full access. The
 * server re-validates everything; its errors appear inside the dialog, and its
 * success message is announced by the dialog and shown under the form.
 */
export function GrantAdminForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingEmail, setPendingEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    const problem = !value
      ? "Enter the email address they’ll sign in with."
      : value.length > 254 || !LOOKS_LIKE_EMAIL.test(value)
        ? "Enter a full email address, like name@example.com."
        : undefined;

    setSuccess(null);
    setError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    setPendingEmail(value);
    // A fresh dialog for each attempt, so an earlier attempt's error isn't shown again.
    setAttempt((count) => count + 1);
    setOpen(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          ref={inputRef}
          name="email"
          type="email"
          label="Email address"
          hint="The address they’ll sign in with, by email link or Google."
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(undefined);
          }}
          error={error ?? ""}
          className="min-w-0 flex-1"
        />
        {/* Lines the button up with the input, below its label. */}
        <Button type="submit" size="sm" className="sm:mt-[1.725rem]">
          Give admin access
        </Button>
      </div>

      {/* Announces a problem found on submit even when the field already had focus (Enter pressed in it). */}
      <p role="status" aria-live="polite" className="sr-only">
        {error}
      </p>

      {success ? (
        <p className="mt-3 flex items-start gap-2 text-body-sm text-success">
          <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />
          <span>{success}</span>
        </p>
      ) : null}

      <ConfirmDialog
        key={attempt}
        open={open}
        onOpenChange={setOpen}
        title="Give admin access?"
        description="Check this is exactly the right address: whoever can sign in with it gets full access."
        confirmLabel="Give admin access"
        pendingLabel="Giving access…"
        action={() => grantAdminAccess({ email: pendingEmail })}
        onSuccess={(result) => {
          setSuccess(result.message ?? `${result.data.email} now has admin access.`);
          setEmail("");
        }}
      >
        <p className="border px-3 py-2.5 text-body font-medium break-all">{pendingEmail}</p>
        <p>
          Admins can see every order and customer, change products, prices and stock, cancel orders and issue refunds.
        </p>
        <p>
          If nobody has signed in with this address yet, an account is created for it now, with admin access already
          switched on, so their first sign-in brings them straight here.
        </p>
      </ConfirmDialog>
    </form>
  );
}
