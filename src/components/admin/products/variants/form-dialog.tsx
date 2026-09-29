"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AdminForm, FormStatus, SubmitButton, useAdminForm, type AdminFormAction } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/*
 * A dialog whose body is one admin form (AdminForm, so a refused save keeps what
 * the owner typed). It can't be closed while saving; on success it closes and
 * hands its message to the section's confirmation line, because the dialog —
 * and the message inside it — would otherwise disappear together.
 */

/** Reports the surrounding AdminForm's pending state to the dialog around it. */
function PendingWatch({ onChange }: { onChange: (pending: boolean) => void }) {
  const pending = useAdminForm()?.pending ?? false;
  useEffect(() => {
    onChange(pending);
  }, [pending, onChange]);
  return null;
}

export interface FormDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  /** A server action taking (previousResult, formData). */
  action: AdminFormAction<T>;
  /** The verb on the submit button: "Add colours", "Save price". Never "OK". */
  submitLabel: string;
  pendingLabel?: string;
  /** Called after a successful save, with the result's message, once the dialog has closed. */
  onSaved?: (message?: string) => void;
  /** The fields. */
  children: ReactNode;
}

/** See the file comment. */
export function FormDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  action,
  submitLabel,
  pendingLabel,
  onSaved,
  children,
}: FormDialogProps<T>) {
  const [pending, setPending] = useState(false);

  function requestOpenChange(next: boolean) {
    if (!next && pending) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={requestOpenChange} title={title} description={description} size={size}>
      <AdminForm
        action={action}
        className="space-y-5"
        onSuccess={(result) => {
          setPending(false);
          onOpenChange(false);
          onSaved?.(result.message);
        }}
      >
        <PendingWatch onChange={setPending} />
        {children}
        <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-end">
          <FormStatus className="sm:mr-auto" />
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
        </div>
      </AdminForm>
    </Dialog>
  );
}

/** A quiet explanatory line inside a dialog or panel. */
export function DialogNote({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted-foreground">{children}</p>;
}
