"use client";

import { useState, useTransition } from "react";

import { duplicateDiscount, setDiscountActive } from "@/app/admin/discounts/actions";
import { AdminForm, FormStatus, SubmitButton, TextField } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CODE_MAX_LENGTH, normalizeDiscountCode } from "@/lib/admin/discount-schema";

import { useDiscountFeedback } from "./discount-feedback";

/*
 * A code's page actions beside its title: switch it on or off (takes effect at
 * checkout straight away; the button says which way it goes), and copy it under
 * a new code. The page's one filled button is the form's Save, so these are
 * outlined.
 */
export function DiscountActions({
  id,
  code,
  isActive,
  suggestedCopyCode,
}: {
  id: string;
  code: string;
  isActive: boolean;
  suggestedCopyCode: string;
}) {
  const [pending, startTransition] = useTransition();
  const [copyOpen, setCopyOpen] = useState(false);
  // Remounts the copy form each time it opens, so an old error doesn't linger.
  const [copyAttempt, setCopyAttempt] = useState(0);
  const announce = useDiscountFeedback();

  function toggle() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof setDiscountActive>>;
      try {
        result = await setDiscountActive({ id, active: !isActive });
      } catch {
        result = { ok: false, message: "Something went wrong. Refresh the page to check, then try again." };
      }
      announce(result.message ?? (result.ok ? "Saved." : "That didn’t work."), result.ok ? "success" : "error");
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggle}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? (isActive ? "Switching off…" : "Switching on…") : isActive ? "Switch off" : "Switch on"}
        <span className="sr-only"> {code}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => {
          setCopyAttempt((attempt) => attempt + 1);
          setCopyOpen(true);
        }}
      >
        Duplicate
      </Button>

      <Dialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        title={`Copy ${code}`}
        description="The copy gets the same discount, dates, limits and restrictions."
      >
        <AdminForm key={copyAttempt} action={duplicateDiscount} noValidate>
          <input type="hidden" name="id" value={id} />
          <TextField
            name="code"
            label="Code for the copy"
            defaultValue={suggestedCopyCode}
            required
            autoFocus
            maxLength={CODE_MAX_LENGTH + 8}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="[&_input]:uppercase [&_input]:tracking-wide"
            onBlur={(event) => {
              event.currentTarget.value = normalizeDiscountCode(event.currentTarget.value);
            }}
            hint="3–32 letters, numbers or hyphens."
          />
          <p className="mt-4 text-body-sm text-muted-foreground">
            It starts switched off with no uses, so you can check it (and change its dates) before customers can use
            it. {code} stays as it is.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <FormStatus className="sm:mr-auto" />
            <Button type="button" variant="outline" size="sm" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Copying…">Create copy</SubmitButton>
          </div>
        </AdminForm>
      </Dialog>
    </>
  );
}
