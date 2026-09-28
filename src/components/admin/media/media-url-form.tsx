"use client";

import { addMediaFromUrl } from "@/app/admin/media-actions";
import { AdminForm, FormStatus, SubmitButton, TextField } from "@/components/admin/ui";
import type { AdminMedia } from "@/lib/admin/media";
import { ALT_TEXT_MAX } from "@/lib/admin/image-probe";

import { ALT_TEXT_HINT, ALT_TEXT_LABEL } from "./media-copy";

export interface MediaUrlFormProps {
  submitLabel: string;
  /** The parent is busy with the saved photo. */
  choosing: boolean;
  uploadsEnabled: boolean | null;
  onAdded: (media: AdminMedia, note: string | null) => void;
}

/**
 * The picker's "By web address" tab: paste the address of a photo on Unsplash or
 * Cloudinary, describe it, and the server fetches it to check it really is a
 * photo (and how big it is) before adding it to the library.
 */
export function MediaUrlForm({ submitLabel, choosing, uploadsEnabled, onAdded }: MediaUrlFormProps) {
  return (
    // React events travel up through portals, so stop this form's submit from
    // reaching a form the picker sits in (e.g. a category form with a photo field).
    <div onSubmit={(event) => event.stopPropagation()}>
      <AdminForm
        action={addMediaFromUrl}
        onSuccess={(result) => onAdded(result.data, result.message ?? null)}
        noValidate
        className="space-y-5"
      >
        {uploadsEnabled === false ? (
          <p className="border-l-2 border-accent-brand pl-3 text-body-sm text-muted-foreground">
            Uploads need Cloudinary, which isn’t set up yet, so for now photos are added by their web address.
          </p>
        ) : null}
        <TextField
          name="url"
          label="Image address"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          maxLength={2048}
          placeholder="https://images.unsplash.com/photo-…"
          hint="From Unsplash (images.unsplash.com) or Cloudinary (res.cloudinary.com). Open the photo, right-click it and choose “Copy image address”."
        />
        <TextField
          name="alt"
          label={ALT_TEXT_LABEL}
          hint={ALT_TEXT_HINT}
          maxLength={ALT_TEXT_MAX}
          autoComplete="off"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SubmitButton pendingLabel="Checking the photo…" disabled={choosing}>
            {choosing ? "Adding…" : submitLabel}
          </SubmitButton>
          <FormStatus />
        </div>
      </AdminForm>
    </div>
  );
}
