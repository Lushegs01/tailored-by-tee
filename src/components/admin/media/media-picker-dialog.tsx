"use client";

import { useMemo, useState, useTransition } from "react";
import { Tabs } from "radix-ui";

import { Dialog } from "@/components/ui/dialog";
import type { AdminMedia } from "@/lib/admin/media";
import { cn } from "@/lib/utils";

import { MediaLibraryBrowser } from "./media-library";
import { MediaUpload } from "./media-upload";
import { MediaUrlForm } from "./media-url-form";

export type MediaPickerTab = "library" | "upload" | "url";

/** What choosing a photo led to: ok closes the picker; a failure is shown inside it. */
export type MediaChooseResult = { ok: true } | { ok: false; message: string };

export interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Choose a photo", "Add a photo to Linen Shirt". */
  title?: string;
  description?: string;
  /**
   * Receives the chosen photo (and, for a photo just added, a note about it such
   * as a size warning). Return { ok: false, message } to keep the picker open
   * with that message, e.g. when attaching the photo failed.
   */
  onChoose: (media: AdminMedia, note: string | null) => MediaChooseResult | Promise<MediaChooseResult>;
  /** The confirm wording in the library, e.g. "Use this photo" (default) or "Add to product". */
  chooseLabel?: string;
  /** Photos that can't be chosen (e.g. already on this product), with the reason shown on them. */
  unavailableIds?: readonly string[];
  unavailableLabel?: string;
  /** Pass when known on the server (isCloudinaryConfigured); otherwise learnt from the library. */
  uploadsEnabled?: boolean;
  initialTab?: MediaPickerTab;
}

const TAB_LABELS: Record<MediaPickerTab, string> = {
  library: "Library",
  upload: "Upload",
  url: "By web address",
};

/**
 * The photo picker: a dialog with three tabs — the media library, an uploader
 * (Cloudinary) and "add by web address". Keyboard-operable throughout (Radix
 * Dialog and Tabs: arrow keys move between tabs, Escape closes). Its state resets
 * each time it opens.
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  title = "Choose a photo",
  description,
  onChoose,
  chooseLabel = "Use this photo",
  unavailableIds,
  unavailableLabel = "Already added",
  uploadsEnabled: uploadsEnabledProp,
  initialTab = "library",
}: MediaPickerDialogProps) {
  return (
    // The Dialog mounts its content only while open, so each opening starts afresh.
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} size="lg">
      <PickerBody
        onClose={() => onOpenChange(false)}
        onChoose={onChoose}
        chooseLabel={chooseLabel}
        unavailableIds={unavailableIds}
        unavailableLabel={unavailableLabel}
        uploadsEnabledProp={uploadsEnabledProp}
        initialTab={initialTab}
      />
    </Dialog>
  );
}

function PickerBody({
  onClose,
  onChoose,
  chooseLabel,
  unavailableIds,
  unavailableLabel,
  uploadsEnabledProp,
  initialTab,
}: {
  onClose: () => void;
  onChoose: MediaPickerDialogProps["onChoose"];
  chooseLabel: string;
  unavailableIds?: readonly string[];
  unavailableLabel: string;
  uploadsEnabledProp?: boolean;
  initialTab: MediaPickerTab;
}) {
  const [tab, setTab] = useState<MediaPickerTab>(initialTab);
  const [learntUploads, setLearntUploads] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, startChoosing] = useTransition();
  const unavailable = useMemo(() => new Set(unavailableIds ?? []), [unavailableIds]);
  const uploadsEnabled = uploadsEnabledProp ?? learntUploads;
  // Words for the upload and address buttons: "Use this photo" → "Upload and use", "Add to product" → "Upload and add".
  const verb = chooseLabel.toLowerCase().startsWith("add") ? "add" : "use";

  function choose(media: AdminMedia, note: string | null) {
    setError(null);
    startChoosing(async () => {
      let result: MediaChooseResult;
      try {
        result = await onChoose(media, note);
      } catch {
        result = { ok: false, message: "Something went wrong. Refresh the page to check, then try again." };
      }
      if (result.ok) onClose();
      else setError(result.message);
    });
  }

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value as MediaPickerTab)}
      className="flex min-h-0 flex-col"
    >
      <Tabs.List aria-label="Ways to add a photo" className="-mt-2 mb-5 flex gap-6 overflow-x-auto border-b">
        {(Object.keys(TAB_LABELS) as MediaPickerTab[]).map((value) => (
          <Tabs.Trigger
            key={value}
            value={value}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent pt-1 pb-3 text-label text-muted-foreground transition-colors hover:text-foreground",
              "data-[state=active]:border-foreground data-[state=active]:text-foreground",
            )}
          >
            {TAB_LABELS[value]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <div
        role="alert"
        className={cn("text-body-sm text-danger", error && "mb-4 border-l-2 border-danger pl-3")}
      >
        {error}
      </div>

      {/* All three stay mounted (hidden when inactive) so switching tabs never loses a search or an upload in progress. */}
      <Tabs.Content value="library" forceMount className="outline-none data-[state=inactive]:hidden">
        <MediaLibraryBrowser
          chooseLabel={chooseLabel}
          unavailableIds={unavailable}
          unavailableLabel={unavailableLabel}
          choosing={choosing}
          onChoose={(media) => choose(media, null)}
          onUploadsEnabled={setLearntUploads}
          uploadsEnabled={uploadsEnabled}
          onGoToTab={setTab}
        />
      </Tabs.Content>
      <Tabs.Content value="upload" forceMount className="outline-none data-[state=inactive]:hidden">
        <MediaUpload
          uploadsEnabled={uploadsEnabled}
          submitLabel={verb === "add" ? "Upload and add" : "Upload and use"}
          choosing={choosing}
          onUploaded={choose}
          onUseUrlInstead={() => setTab("url")}
        />
      </Tabs.Content>
      <Tabs.Content value="url" forceMount className="outline-none data-[state=inactive]:hidden">
        <MediaUrlForm
          submitLabel={verb === "add" ? "Add photo" : "Add and use"}
          choosing={choosing}
          uploadsEnabled={uploadsEnabled}
          onAdded={choose}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}
