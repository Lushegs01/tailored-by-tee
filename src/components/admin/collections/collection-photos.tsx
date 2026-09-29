"use client";

import { useRef, useState } from "react";

import {
  addCollectionPhotoAction,
  moveCollectionPhotoAction,
  removeCollectionPhotoAction,
} from "@/app/admin/collections/actions";
import { MediaPickerDialog, type MediaChooseResult } from "@/components/admin/media/media-picker-dialog";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { AdminEmptyState, ConfirmDialog } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import type { CollectionPhoto } from "@/lib/admin/collections";
import type { AdminMedia } from "@/lib/admin/media";

import { ReorderButtons } from "./reorder-buttons";

export interface CollectionPhotosProps {
  collectionId: string;
  collectionName: string;
  photos: CollectionPhoto[];
  /** Id of the large photo, which the collection page doesn't repeat in the gallery. */
  heroImageId: string | null;
  maxPhotos: number;
  uploadsEnabled: boolean;
}

/**
 * A collection's campaign photos: add from the library, an upload or a web
 * address (the shared photo picker), reorder, and take out (the photo stays in
 * the library). Each change is saved at once.
 */
export function CollectionPhotos({
  collectionId,
  collectionName,
  photos,
  heroImageId,
  maxPhotos,
  uploadsEnabled,
}: CollectionPhotosProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const full = photos.length >= maxPhotos;

  // Photos after the large one, as the collection page shows them.
  const shown = photos.filter((photo) => photo.mediaId !== heroImageId).slice(0, 2).map((photo) => photo.mediaId);

  async function choose(media: AdminMedia): Promise<MediaChooseResult> {
    let result;
    try {
      result = await addCollectionPhotoAction({ collectionId, mediaId: media.id });
    } catch {
      return { ok: false, message: "That didn’t save. Refresh the page and try again." };
    }
    if (!result.ok) return { ok: false, message: result.message };
    setMessage({ text: result.message ?? "Photo added.", id: Date.now() });
    return { ok: true };
  }

  return (
    <div>
      {photos.length === 0 ? (
        <div className="border border-dashed">
          <AdminEmptyState
            title="No campaign photos"
            body="The collection’s page will show just the large photo and the pieces."
          />
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.mediaId} className="flex min-w-0 flex-col border">
              <MediaThumb media={photo} alt="" sizes="(min-width: 1024px) 12rem, 45vw" />
              <div className="flex flex-1 flex-col gap-2 p-2.5">
                <p className="line-clamp-2 text-caption break-words">{photo.alt || "No description"}</p>
                <p className="text-micro text-muted-foreground">
                  {index + 1} of {photos.length}
                  {photo.mediaId === heroImageId
                    ? " · Also the large photo"
                    : shown.includes(photo.mediaId)
                      ? " · Shown on the page"
                      : ""}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <ReorderButtons
                    itemName={`photo ${index + 1}`}
                    index={index}
                    count={photos.length}
                    labels={{ up: "earlier", down: "later" }}
                    move={(direction) => moveCollectionPhotoAction(collectionId, photo.mediaId, direction)}
                    className="items-start"
                  />
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-caption">
                        Take out<span className="sr-only"> photo {index + 1}</span>
                      </Button>
                    }
                    title={`Take this photo out of ${collectionName}?`}
                    confirmLabel="Take out"
                    pendingLabel="Taking out…"
                    tone="destructive"
                    action={() => removeCollectionPhotoAction({ collectionId, mediaId: photo.mediaId })}
                    onSuccess={(result) => {
                      setMessage({ text: result.message ?? "Photo taken out.", id: Date.now() });
                      addRef.current?.focus();
                    }}
                  >
                    <p>It stays in the photo library and anywhere else it’s used.</p>
                  </ConfirmDialog>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div role="status" aria-live="polite" className="text-body-sm">
        {message ? (
          <p key={message.id} className="mt-3 text-success">
            {message.text}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          disabled={full}
          onClick={() => setOpen(true)}
        >
          Add a photo
        </Button>
        <p className="text-caption text-muted-foreground">
          {full
            ? `That’s the most a collection can have (${maxPhotos}). Take one out to add another.`
            : `${photos.length} of up to ${maxPhotos}.`}
        </p>
      </div>

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        title={`Add a photo to ${collectionName}`}
        onChoose={choose}
        chooseLabel="Add to collection"
        unavailableIds={photos.map((photo) => photo.mediaId)}
        unavailableLabel="Already added"
        uploadsEnabled={uploadsEnabled}
      />
    </div>
  );
}
