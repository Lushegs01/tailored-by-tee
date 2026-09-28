"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";

import { requestMediaUploadTicket, saveMediaUpload } from "@/app/admin/media-actions";
import { TextField } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminMedia } from "@/lib/admin/media";
import { ALT_TEXT_MAX, UPLOAD_ACCEPT_ATTRIBUTE, imageSizeAdvice, probeImage } from "@/lib/admin/image-probe";
import { cn } from "@/lib/utils";

import { ALT_TEXT_HINT, ALT_TEXT_LABEL } from "./media-copy";
import { checkUploadFile, describeUploadError, pickUploadReply } from "./upload-checks";

export interface MediaUploadProps {
  /** null while not yet known. */
  uploadsEnabled: boolean | null;
  /** Label of the final button, e.g. "Upload and use" or "Upload and add". */
  submitLabel: string;
  /** The parent is busy with the saved photo. */
  choosing: boolean;
  onUploaded: (media: AdminMedia, note: string | null) => void;
  onUseUrlInstead: () => void;
}

type Phase = "idle" | "uploading" | "saving";

interface Chosen {
  file: File;
  previewUrl: string;
  size: { width: number; height: number } | null;
}

const UPLOAD_TIMEOUT_MS = 5 * 60_000;

interface XhrResult {
  status: number;
  body: Record<string, unknown> | null;
}

/** POSTs a form with upload progress. Resolves with status 0 when the connection fails; rejects only when aborted. */
function postWithProgress(
  url: string,
  body: FormData,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      const response: unknown = xhr.response;
      resolve({
        status: xhr.status,
        body: response && typeof response === "object" ? (response as Record<string, unknown>) : null,
      });
    };
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.ontimeout = () => resolve({ status: 0, body: null });
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Width and height as browsers will show the photo (EXIF rotation applied), or null when unreadable. */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const probed = probeImage(new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer()));
    if (probed) return { width: probed.width, height: probed.height };
  } catch {
    // fall through to the browser's decoder
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * The picker's Upload tab: choose or drop a photo, describe it, upload it straight
 * to Cloudinary with a progress bar, then save it to the library. If saving fails
 * after the upload finished, trying again only repeats the save.
 */
export function MediaUpload({
  uploadsEnabled,
  submitLabel,
  choosing,
  onUploaded,
  onUseUrlInstead,
}: MediaUploadProps) {
  const inputId = useId();
  const hintId = useId();
  const fileErrorId = useId();
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [altError, setAltError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploaded = useRef<{ file: File; reply: Record<string, unknown> } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  // Stop an upload and free the preview when the picker closes.
  useEffect(
    () => () => {
      abort.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const busy = phase !== "idle" || choosing;

  async function acceptFile(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    const problem = checkUploadFile(file);
    if (problem) {
      setFileError(problem);
      return;
    }
    const size = await readImageSize(file);
    if (!size) {
      setFileError("That file couldn’t be read as a photo. Choose a JPEG, PNG, WebP or AVIF photo.");
      return;
    }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    uploaded.current = null;
    setFileError(null);
    setChosen({ file, previewUrl: previewUrl.current, size });
  }

  function clearFile() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    uploaded.current = null;
    setChosen(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
    fileInput.current?.focus();
  }

  function validateAlt(): string | null {
    const text = alt.trim();
    if (text === "")
      return "Describe the photo in a few words. It’s read aloud to customers who can’t see it.";
    if (text.length < 3) return "The description needs at least 3 characters.";
    if (text.length > ALT_TEXT_MAX) return `The description must be ${ALT_TEXT_MAX} characters or fewer.`;
    return null;
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Keep the submit from reaching a form this picker sits in (React events cross portals).
    event.stopPropagation();
    if (busy) return;
    setError(null);
    if (!chosen) {
      setFileError("Choose a photo to upload.");
      fileInput.current?.focus();
      return;
    }
    const altProblem = validateAlt();
    setAltError(altProblem);
    if (altProblem) {
      document.getElementById(`${inputId}-alt`)?.focus();
      return;
    }

    let reply = uploaded.current?.file === chosen.file ? uploaded.current.reply : null;
    if (!reply) {
      setPhase("uploading");
      setProgress(0);
      const ticket = await requestMediaUploadTicket().catch(() => null);
      if (!ticket || !ticket.ok) {
        setPhase("idle");
        setError(ticket?.message ?? "The upload couldn’t start. Check your connection and try again.");
        return;
      }
      const body = new FormData();
      for (const [key, value] of Object.entries(ticket.data.fields)) body.append(key, value);
      body.append("file", chosen.file);

      const controller = new AbortController();
      abort.current = controller;
      let result: XhrResult;
      try {
        result = await postWithProgress(ticket.data.uploadUrl, body, setProgress, controller.signal);
      } catch {
        setPhase("idle");
        setError("Upload cancelled.");
        return;
      } finally {
        abort.current = null;
      }

      if (result.status !== 200 || !result.body || typeof result.body.public_id !== "string") {
        const cloudinaryError = result.body?.error as { message?: unknown } | undefined;
        setPhase("idle");
        setError(
          describeUploadError(
            result.status,
            typeof cloudinaryError?.message === "string" ? cloudinaryError.message : null,
          ),
        );
        return;
      }
      reply = pickUploadReply(result.body);
      uploaded.current = { file: chosen.file, reply };
    }

    setPhase("saving");
    const saved = await saveMediaUpload({ upload: reply, alt: alt.trim() }).catch(() => null);
    setPhase("idle");
    if (!saved) {
      setError(
        "The photo uploaded, but couldn’t be saved to the library. Check your connection and try again.",
      );
      return;
    }
    if (!saved.ok) {
      if (saved.fieldErrors?.alt) setAltError(saved.fieldErrors.alt);
      setError(saved.message);
      return;
    }
    onUploaded(saved.data, saved.message ?? null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void acceptFile(event.dataTransfer.files[0]);
  }

  if (uploadsEnabled === null) {
    return (
      <div role="status">
        <span className="sr-only">Loading</span>
        <Skeleton aria-hidden="true" className="h-40 w-full" />
      </div>
    );
  }

  if (!uploadsEnabled) {
    return (
      <div className="border p-5">
        <h3 className="text-body-sm font-medium">Uploads aren’t switched on yet</h3>
        <p className="mt-2 max-w-prose text-body-sm text-muted-foreground">
          Uploading photos from this device needs Cloudinary, which stores and resizes them. Until it’s set
          up, add photos by their web address from Unsplash or Cloudinary. Your developer can switch uploads
          on by adding the three Cloudinary keys (see Settings).
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onUseUrlInstead}>
          Add by web address
        </Button>
      </div>
    );
  }

  const advice = chosen?.size ? imageSizeAdvice(chosen.size) : null;
  const status =
    phase === "uploading"
      ? `Uploading… ${progress}%`
      : phase === "saving"
        ? "Saving to the library…"
        : choosing
          ? "Adding…"
          : null;

  return (
    <form onSubmit={upload} noValidate className="space-y-5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border p-4 transition-colors md:p-5",
          dragging ? "border-foreground bg-surface" : "border-dashed border-border-strong",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {chosen ? (
            // A local preview (blob: address), cropped to the shop's 4:5 frame.
            <div className="relative aspect-4/5 w-28 shrink-0 overflow-hidden bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- local file preview; next/image can't load blob: addresses */}
              <img src={chosen.previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <label htmlFor={inputId} className="block text-body-sm font-medium">
              Photo
            </label>
            <p id={hintId} className="mt-1 text-caption text-muted-foreground">
              JPEG, PNG, WebP or AVIF, up to 15 MB. At least 1,200 px on the longest side; portrait 4:5 suits
              product photos best. You can also drop a photo here.
            </p>
            <input
              ref={fileInput}
              id={inputId}
              type="file"
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              disabled={busy}
              aria-describedby={[hintId, fileError ? fileErrorId : null].filter(Boolean).join(" ")}
              aria-invalid={fileError ? true : undefined}
              onChange={(event) => void acceptFile(event.target.files?.[0])}
              className="mt-3 block w-full max-w-full text-body-sm text-muted-foreground file:mr-4 file:h-10 file:cursor-pointer file:border file:border-foreground/60 file:bg-transparent file:px-4 file:text-label file:text-foreground hover:file:border-foreground disabled:opacity-50"
            />
            {fileError ? (
              <p id={fileErrorId} className="mt-2 text-caption text-danger">
                {fileError}
              </p>
            ) : null}
            {chosen ? (
              <div className="mt-3 text-caption text-muted-foreground">
                <p className="break-all">
                  {chosen.file.name}
                  {chosen.size ? (
                    <span className="tabular-nums">
                      {" "}
                      · {chosen.size.width.toLocaleString("en-GB")} ×{" "}
                      {chosen.size.height.toLocaleString("en-GB")} px
                    </span>
                  ) : null}
                </p>
                {advice ? <p className="mt-1 text-accent-brand">{advice}</p> : null}
                {!busy ? (
                  <button type="button" onClick={clearFile} className="mt-2 text-body-sm text-foreground">
                    <span className="link-underline-static pb-0.5">Choose a different photo</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <TextField
        id={`${inputId}-alt`}
        name="media-upload-alt"
        label={ALT_TEXT_LABEL}
        hint={ALT_TEXT_HINT}
        error={altError ?? ""}
        value={alt}
        maxLength={ALT_TEXT_MAX}
        disabled={busy}
        autoComplete="off"
        onChange={(event) => {
          setAlt(event.target.value);
          if (altError) setAltError(null);
        }}
      />

      {phase === "uploading" ? (
        <div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1 w-full bg-surface"
          >
            <div
              className="h-full bg-foreground transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy || undefined}>
          {status ?? submitLabel}
        </Button>
        {phase === "uploading" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
            Cancel upload
          </Button>
        ) : null}
        <div role="status" aria-live="polite" className="min-w-0 text-body-sm">
          {error ? (
            <p className="text-danger">{error}</p>
          ) : phase === "saving" ? (
            <p className="text-muted-foreground">Saving to the library…</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
