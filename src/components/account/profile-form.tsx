"use client";

import * as React from "react";

import { saveProfile, type ProfileActionResult, type ProfileFormValues } from "@/app/account/(member)/profile/actions";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
 * Name and mobile number. A plain form post through useActionState, so it saves
 * before JavaScript loads too. Fields are uncontrolled: React resets the form
 * after each submission, back to the values the server returned (what was saved,
 * or what was typed when something needs fixing).
 */

export interface ProfileFormProps {
  initial: ProfileFormValues;
  email: string;
  supportEmail: string;
  className?: string;
}

export function ProfileForm({ initial, email, supportEmail, className }: ProfileFormProps) {
  const [state, formAction, pending] = React.useActionState<ProfileActionResult | null, FormData>(saveProfile, null);
  const values = state?.values ?? initial;
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Take the customer to the first field that needs fixing (focus is a DOM effect, not state).
  React.useEffect(() => {
    if (!state || state.ok) return;
    const first = state.fieldErrors?.name ? "profile-name" : state.fieldErrors?.phone ? "profile-phone" : null;
    if (first) document.getElementById(first)?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate aria-label="Your details" className={cn("max-w-xl", className)}>
      {state && !state.ok ? (
        <p role="alert" className="mb-8 border border-danger/40 px-4 py-3 text-body-sm">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-6">
        <ProfileField
          id="profile-name"
          name="name"
          label="Full name"
          autoComplete="name"
          maxLength={100}
          required
          defaultValue={values.name}
          error={fieldErrors.name}
        />
        <ProfileField
          id="profile-phone"
          name="phone"
          label="Mobile number"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          defaultValue={values.phone}
          error={fieldErrors.phone}
        />
        <div>
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            readOnly
            aria-describedby="profile-email-hint"
            className="bg-surface text-muted-foreground"
          />
          <FieldHint id="profile-email-hint">
            This is how you sign in. To change it, contact us at{" "}
            <a href={`mailto:${supportEmail}`} className="link-underline-static text-foreground">
              {supportEmail}
            </a>
            .
          </FieldHint>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <div role="status" aria-live="polite" aria-atomic="true">
          {state?.ok && !pending ? (
            <p key={state.savedAt} className="flex items-center gap-2 text-body-sm">
              <CheckIcon aria-hidden="true" className="shrink-0 text-success" />
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

type ProfileFieldProps = Omit<React.ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
};

/** Labelled uncontrolled field; its error is linked with aria-describedby. */
function ProfileField({ id, label, error, optional, ...props }: ProfileFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
