"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AdminForm, FormStatus, SubmitButton, useAdminForm, type AdminFormAction } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export interface DeleteRecordDialogProps {
  /** The record's id, sent as the form's "id" field. */
  id: string;
  /** The button that opens the dialog, e.g. "Delete collection". */
  triggerLabel: string;
  /** A plain question: "Delete the collection “Harmattan”?" */
  title: string;
  /** What happens and what doesn't. */
  children: ReactNode;
  /** The verb on the confirm button, e.g. "Delete collection". */
  confirmLabel: string;
  /** An AdminForm action that redirects away on success (the record is gone). */
  action: AdminFormAction<null>;
  disabled?: boolean;
}

/**
 * Confirmation before deleting a collection or category. Unlike ConfirmDialog it
 * submits through an AdminForm, because a successful delete ends in a redirect
 * (the page being viewed no longer exists) and a form action hands that redirect
 * to Next's router properly. Focus starts on "Go back"; the dialog can't be
 * dismissed while the delete is saving; a refusal is shown inside it.
 */
export function DeleteRecordDialog({
  id,
  triggerLabel,
  title,
  children,
  confirmLabel,
  action,
  disabled = false,
}: DeleteRecordDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // A fresh form (and no stale error) each time the dialog opens.
  const [attempt, setAttempt] = useState(0);

  function onOpenChange(next: boolean) {
    if (!next && pending) return;
    if (next) setAttempt((value) => value + 1);
    setOpen(next);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(true)}
        className="border-danger/70 text-danger hover:border-danger hover:bg-danger hover:text-paper"
      >
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange} title={title}>
        <AdminForm key={attempt} action={action}>
          <input type="hidden" name="id" value={id} />
          <div className="text-body-sm text-foreground [&_p+p]:mt-3">{children}</div>
          <FormStatus className="mt-4" />
          <DialogButtons confirmLabel={confirmLabel} onCancel={() => onOpenChange(false)} onPending={setPending} />
        </AdminForm>
      </Dialog>
    </>
  );
}

function DialogButtons({
  confirmLabel,
  onCancel,
  onPending,
}: {
  confirmLabel: string;
  onCancel: () => void;
  onPending: (pending: boolean) => void;
}) {
  const form = useAdminForm();
  const pending = form?.pending ?? false;

  useEffect(() => {
    onPending(pending);
  }, [pending, onPending]);

  return (
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="sm" disabled={pending} autoFocus onClick={onCancel}>
        Go back
      </Button>
      <SubmitButton pendingLabel="Deleting…" className="bg-danger text-paper hover:bg-danger/85">
        {confirmLabel}
      </SubmitButton>
    </div>
  );
}
