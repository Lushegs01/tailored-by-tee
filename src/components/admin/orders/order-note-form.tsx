"use client";

import { addOrderNote } from "@/app/admin/orders/actions";
import { AdminForm, FormStatus, SubmitButton, TextAreaField } from "@/components/admin/ui";

import { NOTE_HINT } from "./order-copy";
import { useOrderFeedback } from "./order-feedback";

/*
 * An internal note on the order's timeline — "customer rang, wants it held until
 * Friday". Only admins ever see it. The box is cleared once the note is saved,
 * and kept as typed if the save is refused.
 */

export function OrderNoteForm({ number }: { number: string }) {
  const announce = useOrderFeedback();

  return (
    <AdminForm
      action={addOrderNote}
      resetOnSuccess
      className="space-y-4"
      onSuccess={() => announce("Note added to the order.")}
    >
      <input type="hidden" name="number" value={number} />

      <TextAreaField
        name="note"
        label="Add a note"
        rows={3}
        maxLength={500}
        hint={NOTE_HINT}
        placeholder="Customer rang — hold until Friday."
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <FormStatus className="sm:mr-auto" />
        <SubmitButton variant="outline" pendingLabel="Adding…">
          Add note
        </SubmitButton>
      </div>
    </AdminForm>
  );
}
