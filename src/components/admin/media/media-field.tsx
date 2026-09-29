"use client";

import { useEffect, useRef, useState } from "react";

import { FieldShell, useFieldIds } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import type { AdminMedia } from "@/lib/admin/media";

import { MediaPickerDialog, type MediaChooseResult } from "./media-picker-dialog";
import { MediaThumb } from "./media-thumb";

export interface MediaFieldProps {
  /** The form field name: a hidden input sends the chosen photo's id, or "" when none. */
  name: string;
  label: string;
  /** The photo chosen when the form opens (getAdminMedia on the server), or null. */
  defaultValue: AdminMedia | null;
  hint?: string;
  /** Leave out the "(optional)" marker. The server action still has to require a value. */
  required?: boolean;
  className?: string;
}

/**
 * A photo field for any admin form (category image, collection hero…):
 *
 *   <AdminForm action={saveCategory}>
 *     <MediaField name="imageId" label="Category image" defaultValue={await getAdminMedia(category.imageId)} />
 *   </AdminForm>
 *
 * Shows the chosen photo in the shop's 4:5 frame with its description, opens the
 * photo picker (library, upload, web address) to choose or change it, and can be
 * cleared. Submits the photo's id — read it with zId() or accept "" for none —
 * and follows the form's reset. Inside an AdminForm its error comes from the
 * form's result by `name`.
 */
export function MediaField({
  name,
  label,
  defaultValue,
  hint,
  required = false,
  className,
}: MediaFieldProps) {
  const [media, setMedia] = useState<AdminMedia | null>(defaultValue);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const ids = useFieldIds(name, undefined, hint);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const defaults = useRef(defaultValue);

  useEffect(() => {
    defaults.current = defaultValue;
  });

  // Follow the form's reset (e.g. AdminForm's resetOnSuccess) back to the starting photo.
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    function onReset() {
      setMedia(defaults.current);
      setNote(null);
    }
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function choose(chosen: AdminMedia, chosenNote: string | null): MediaChooseResult {
    setMedia(chosen);
    // A note about a newly added photo (e.g. "it's small"), minus the routine "added" part.
    setNote(chosenNote?.replace(/^Photo (added|uploaded)\.\s*/, "").trim() || null);
    setAnnouncement(`Chosen: ${chosen.alt}`);
    return { ok: true };
  }

  function clear() {
    setMedia(null);
    setNote(null);
    setAnnouncement("Photo removed. Save to keep this change.");
    buttonRef.current?.focus();
  }

  return (
    <FieldShell {...ids} label={label} optional={!required} hint={hint} className={className}>
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0 sm:w-28">
          {media ? (
            <MediaThumb media={media} alt="" sizes="7rem" />
          ) : (
            <div className="flex aspect-4/5 items-center justify-center border border-dashed border-border-strong p-2 text-center text-caption text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {media ? (
            <>
              <p className="line-clamp-3 text-body-sm">{media.alt || "No description"}</p>
              <p className="mt-1 text-caption text-muted-foreground tabular-nums">
                {media.width.toLocaleString("en-GB")} × {media.height.toLocaleString("en-GB")} px
              </p>
            </>
          ) : (
            <p className="text-body-sm text-muted-foreground">No photo chosen.</p>
          )}
          {note ? <p className="mt-1 text-caption text-accent-brand">{note}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              ref={buttonRef}
              type="button"
              variant="outline"
              size="sm"
              aria-haspopup="dialog"
              aria-label={`${media ? "Change" : "Choose"} photo: ${label}`}
              {...ids.controlProps}
              onClick={() => setOpen(true)}
            >
              {media ? "Change photo" : "Choose photo"}
            </Button>
            {media ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clear}
                aria-label={`Remove photo: ${label}`}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <input ref={hiddenRef} type="hidden" name={name} value={media?.id ?? ""} />
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        title={media ? `Change photo: ${label}` : `Choose photo: ${label}`}
        onChoose={choose}
        chooseLabel="Use this photo"
        unavailableIds={media ? [media.id] : undefined}
        unavailableLabel="Chosen"
      />
    </FieldShell>
  );
}
