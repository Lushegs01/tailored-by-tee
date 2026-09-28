"use client";

import { useEffect, useId, useRef, useState } from "react";

import { deleteMediaFromLibrary, searchMediaLibrary } from "@/app/admin/media-actions";
import { AdminEmptyState, ConfirmDialog } from "@/components/admin/ui";
import { CheckIcon, CloseIcon, SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminMedia, AdminMediaListItem } from "@/lib/admin/media";
import { cn } from "@/lib/utils";

import { MEDIA_SOURCE_LABELS, describeUsageShort } from "./media-copy";
import { MediaThumb } from "./media-thumb";

export interface MediaLibraryBrowserProps {
  /** The confirm button's words, e.g. "Use this photo" or "Add to product". */
  chooseLabel: string;
  /** Photos that can't be chosen here (e.g. already on this product). */
  unavailableIds: ReadonlySet<string>;
  unavailableLabel: string;
  /** The parent is busy with the chosen photo. */
  choosing: boolean;
  onChoose: (media: AdminMedia) => void;
  /** Reports whether uploads are switched on (learnt from the first page). */
  onUploadsEnabled: (enabled: boolean) => void;
  uploadsEnabled: boolean | null;
  onGoToTab: (tab: "upload" | "url") => void;
}

interface LibraryState {
  items: AdminMediaListItem[];
  page: number;
  pageCount: number;
  total: number;
  query: string;
}

const SEARCH_DELAY_MS = 300;
const FAILED = "The media library couldn’t be loaded. Check your connection and try again.";

/**
 * The media library inside the photo picker: newest first, searchable by
 * description, loaded a page at a time. Choosing is two steps (select, then
 * confirm) so a photo's details — size, source, where it's used — are visible
 * first; unused photos can be deleted from here.
 */
export function MediaLibraryBrowser({
  chooseLabel,
  unavailableIds,
  unavailableLabel,
  choosing,
  onChoose,
  onUploadsEnabled,
  uploadsEnabled,
  onGoToTab,
}: MediaLibraryBrowserProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<LibraryState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uploadsCallback = useRef(onUploadsEnabled);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    uploadsCallback.current = onUploadsEnabled;
  });

  /** Loads a page; later requests win over earlier ones still in flight. State is only set once it answers. */
  function fetchPage(q: string, page: number, append: boolean): Promise<void> {
    const id = ++request.current;
    return searchMediaLibrary({ q, page }).then(
      (result) => applyPage(id, q, append, result),
      () => applyPage(id, q, append, null),
    );
  }

  function applyPage(
    id: number,
    q: string,
    append: boolean,
    result: Awaited<ReturnType<typeof searchMediaLibrary>> | null,
  ) {
    if (id !== request.current) return;
    setLoadingMore(false);
    if (!result || !result.ok) {
      // A failed "show more" keeps the photos already shown.
      if (append) setMoreError(result?.message ?? FAILED);
      else {
        setError(result?.message ?? FAILED);
        setStatus("error");
      }
      return;
    }
    setMoreError(null);
    const data = result.data;
    uploadsCallback.current(data.uploadsEnabled);
    setLibrary((previous) => {
      if (!append || !previous) return data;
      const seen = new Set(previous.items.map((item) => item.id));
      return { ...data, items: [...previous.items, ...data.items.filter((item) => !seen.has(item.id))] };
    });
    setStatus("ready");
    setError(null);
    setAnnouncement(
      data.total === 0
        ? q
          ? "No photos match."
          : "The library is empty."
        : `${data.total} photo${data.total === 1 ? "" : "s"}.`,
    );
  }

  // First page on open (once: the picker remounts each time it opens).
  useEffect(() => {
    const id = ++request.current;
    searchMediaLibrary({ q: "", page: 1 }).then(
      (result) => applyPage(id, "", false, result),
      () => applyPage(id, "", false, null),
    );
    return () => {
      request.current += 1;
      clearTimeout(timer.current);
    };
  }, []);

  function search(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("loading");
      setSelectedId(null);
      void fetchPage(value.trim(), 1, false);
    }, SEARCH_DELAY_MS);
  }

  function retry() {
    setStatus("loading");
    void fetchPage(query.trim(), 1, false);
  }

  function loadMore() {
    if (!library || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    void fetchPage(library.query, library.page + 1, true);
  }

  function removeFromList(id: string) {
    setSelectedId(null);
    setLibrary((previous) =>
      previous
        ? {
            ...previous,
            items: previous.items.filter((item) => item.id !== id),
            total: Math.max(0, previous.total - 1),
          }
        : previous,
    );
    // The delete button has gone with the photo: put focus somewhere sensible.
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const selected = library?.items.find((item) => item.id === selectedId) ?? null;
  const selectedUnavailable = selected ? unavailableIds.has(selected.id) : false;
  const hasMore = library ? library.page < library.pageCount : false;

  return (
    <div className="flex min-h-0 flex-col">
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          // Also keep the submit from reaching a form this picker sits in (React events cross portals).
          event.preventDefault();
          event.stopPropagation();
          clearTimeout(timer.current);
          setStatus("loading");
          void fetchPage(query.trim(), 1, false);
        }}
      >
        <label htmlFor={searchId} className="sr-only">
          Search photos by description
        </label>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
        />
        <Input
          ref={searchRef}
          id={searchId}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          value={query}
          placeholder="Search by description"
          onChange={(event) => search(event.target.value)}
          className="h-10 pr-10 pl-9 text-body-sm"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => search("")}
            className="absolute top-1/2 right-0 inline-flex size-10 -translate-y-1/2 items-center justify-center text-base text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        ) : null}
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {status === "loading" ? "Loading photos" : announcement}
      </p>

      <div className="mt-4" aria-busy={status === "loading" || undefined}>
        {status === "loading" && !library ? (
          <TileSkeletons />
        ) : status === "error" ? (
          <AdminEmptyState
            as="p"
            title="Couldn’t load the library"
            body={error ?? FAILED}
            action={
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                Try again
              </Button>
            }
          />
        ) : library && library.items.length === 0 ? (
          library.query ? (
            <AdminEmptyState
              as="p"
              title={`No photos match “${library.query}”`}
              body="Search looks at each photo’s description. Try a shorter word, or clear the search."
            />
          ) : (
            <AdminEmptyState
              as="p"
              title="Your media library is empty"
              body="Photos you upload or add by web address are kept here, so you can reuse them anywhere on the site."
              action={
                <>
                  {uploadsEnabled ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => onGoToTab("upload")}>
                      Upload a photo
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" onClick={() => onGoToTab("url")}>
                    Add by web address
                  </Button>
                </>
              }
            />
          )
        ) : library ? (
          <div className={cn(status === "loading" && "opacity-60 transition-opacity")}>
            <p className="mb-3 text-caption text-muted-foreground tabular-nums">
              {library.query
                ? `${library.total} photo${library.total === 1 ? "" : "s"} matching “${library.query}”`
                : `${library.total} photo${library.total === 1 ? "" : "s"}, newest first`}
            </p>
            <ul role="list" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {library.items.map((item) => {
                const isSelected = item.id === selectedId;
                const unavailable = unavailableIds.has(item.id);
                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${item.alt || "Photo without a description"}${unavailable ? ` (${unavailableLabel.toLowerCase()})` : ""}`}
                      onClick={() => setSelectedId(isSelected ? null : item.id)}
                      className={cn(
                        "relative block w-full border p-0.5 transition-colors",
                        isSelected ? "border-foreground" : "border-transparent hover:border-border-strong",
                      )}
                    >
                      <MediaThumb
                        media={item}
                        alt=""
                        sizes="(min-width: 768px) 7rem, 30vw"
                        className={cn(unavailable && "opacity-50")}
                      />
                      {isSelected ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center bg-foreground text-sm text-background"
                        >
                          <CheckIcon />
                        </span>
                      ) : null}
                      {unavailable ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0.5 bottom-0.5 bg-background-raised/90 px-1.5 py-1 text-left text-micro text-foreground"
                        >
                          {unavailableLabel}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasMore ? (
              <div className="mt-5 flex flex-col items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  aria-busy={loadingMore || undefined}
                >
                  {loadingMore ? "Loading…" : moreError ? "Try again" : "Show more photos"}
                </Button>
                {moreError ? (
                  <p role="alert" className="text-center text-caption text-danger">
                    {moreError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="sticky bottom-0 z-10 -mx-6 mt-6 -mb-6 border-t bg-background-raised px-6 py-4">
          <div className="flex gap-4">
            <MediaThumb media={selected} alt="" sizes="4rem" className="w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-body-sm">{selected.alt || "No description"}</p>
              <p className="mt-1 text-caption text-muted-foreground tabular-nums">
                {selected.width.toLocaleString("en-GB")} × {selected.height.toLocaleString("en-GB")} px ·{" "}
                {MEDIA_SOURCE_LABELS[selected.source]} · {describeUsageShort(selected.usage)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            {selected.usage.total === 0 ? (
              <ConfirmDialog
                tone="destructive"
                title="Delete this photo?"
                description="It isn’t used anywhere on the site."
                confirmLabel="Delete photo"
                pendingLabel="Deleting…"
                action={() => deleteMediaFromLibrary({ mediaId: selected.id })}
                onSuccess={() => removeFromList(selected.id)}
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="text-danger sm:mr-auto">
                    Delete from library
                  </Button>
                }
              >
                <p>
                  The photo will be removed from the media library
                  {selected.source === "upload" ? " and from Cloudinary" : ""}. This can’t be undone.
                </p>
              </ConfirmDialog>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={selectedUnavailable || choosing}
              aria-busy={choosing || undefined}
              onClick={() => onChoose(selected)}
            >
              {selectedUnavailable ? unavailableLabel : choosing ? "Adding…" : chooseLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TileSkeletons() {
  return (
    <div role="status">
      <span className="sr-only">Loading photos</span>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="aspect-4/5 w-full" />
        ))}
      </div>
    </div>
  );
}
