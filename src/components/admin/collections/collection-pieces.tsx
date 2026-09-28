"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  addCollectionPieceAction,
  moveCollectionPieceAction,
  removeCollectionPieceAction,
  searchCollectionPiecesAction,
} from "@/app/admin/collections/actions";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { AdminEmptyState, ConfirmDialog, StatusBadge } from "@/components/admin/ui";
import { SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionPiece, PieceSearchResult } from "@/lib/admin/collections";
import { formatKobo } from "@/lib/admin/format";
import { productStatusDisplay } from "@/lib/admin/status";
import { cn } from "@/lib/utils";

import { ReorderButtons } from "./reorder-buttons";

export interface CollectionPiecesProps {
  collectionId: string;
  collectionName: string;
  pieces: CollectionPiece[];
}

/**
 * The pieces in a collection: the saved order with move up/down and "Take out",
 * and a search for products to add (by name, product code or a pasted SKU; not
 * archived, not already in it). Every change is saved at once; the list
 * re-renders from the server, and a line under the heading says what happened.
 */
export function CollectionPieces({ collectionId, collectionName, pieces }: CollectionPiecesProps) {
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error"; id: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function announce(text: string, tone: "success" | "error" = "success") {
    setMessage({ text, tone, id: Date.now() });
  }

  return (
    <div>
      <div ref={listRef} tabIndex={-1} className="outline-none" aria-label={`Pieces in ${collectionName}`}>
        {pieces.length === 0 ? (
          <div className="border border-dashed">
            <AdminEmptyState
              title="No pieces yet"
              body="Search below to add products. A piece shows in the collection once it’s live and has a photo."
            />
          </div>
        ) : (
          <ol className="divide-y border">
            {pieces.map((piece, index) => (
              <PieceRow
                key={piece.productId}
                piece={piece}
                index={index}
                count={pieces.length}
                collectionId={collectionId}
                collectionName={collectionName}
                onRemoved={(text) => {
                  announce(text);
                  listRef.current?.focus();
                }}
              />
            ))}
          </ol>
        )}
      </div>

      {/* Always present, so each new message is read out. */}
      <div role="status" aria-live="polite" className="text-body-sm">
        {message ? (
          <p key={message.id} className={cn("mt-3", message.tone === "success" ? "text-success" : "text-danger")}>
            {message.text}
          </p>
        ) : null}
      </div>

      <PieceSearch collectionId={collectionId} collectionName={collectionName} onAdded={announce} />
    </div>
  );
}

function PieceRow({
  piece,
  index,
  count,
  collectionId,
  collectionName,
  onRemoved,
}: {
  piece: CollectionPiece;
  index: number;
  count: number;
  collectionId: string;
  collectionName: string;
  onRemoved: (message: string) => void;
}) {
  const status = productStatusDisplay(piece.status);
  const listed = piece.status === "ACTIVE" && piece.hasPhotos;

  return (
    <li className="flex items-start gap-3 px-3 py-3 sm:gap-4 sm:px-4">
      <span aria-hidden="true" className="w-5 shrink-0 pt-1 text-right text-caption text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="w-12 shrink-0">
        {piece.thumb ? (
          <MediaThumb media={piece.thumb} alt="" sizes="3rem" />
        ) : (
          <div className="flex aspect-4/5 items-center justify-center border border-dashed text-center text-micro text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/products/${encodeURIComponent(piece.productId)}`}
          className="font-medium break-words underline-offset-4 hover:underline"
        >
          {piece.name}
        </Link>
        <p className="mt-0.5 text-caption text-muted-foreground">
          <span className="font-mono">{piece.code}</span> · {piece.categoryName} ·{" "}
          <span className="tabular-nums">{formatKobo(piece.price)}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {piece.status === "ACTIVE" && !piece.hasPhotos ? (
            <span className="text-caption text-accent-brand">Not shown: no photos yet</span>
          ) : null}
          {!listed && piece.status !== "ACTIVE" ? (
            <span className="text-caption text-muted-foreground">Not shown in the shop</span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <ReorderButtons
          itemName={piece.name}
          index={index}
          count={count}
          move={(direction) => moveCollectionPieceAction(collectionId, piece.productId, direction)}
        />
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-caption">
              Take out<span className="sr-only"> {piece.name}</span>
            </Button>
          }
          title={`Take “${piece.name}” out of ${collectionName}?`}
          confirmLabel="Take out"
          pendingLabel="Taking out…"
          tone="destructive"
          action={() => removeCollectionPieceAction({ collectionId, productId: piece.productId })}
          onSuccess={(result) => onRemoved(result.message ?? `Took “${piece.name}” out of ${collectionName}.`)}
        >
          <p>The product stays in the shop with its stock and photos. You can add it back at any time.</p>
        </ConfirmDialog>
      </div>
    </li>
  );
}

const SEARCH_DELAY_MS = 300;

function PieceSearch({
  collectionId,
  collectionName,
  onAdded,
}: {
  collectionId: string;
  collectionName: string;
  onAdded: (message: string, tone?: "success" | "error") => void;
}) {
  const inputId = useId();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PieceSearchResult[] | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
  const [, startAdding] = useTransition();
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(text: string) {
    const request = ++latest.current;
    startSearch(async () => {
      let result;
      try {
        result = await searchCollectionPiecesAction({ collectionId, q: text });
      } catch {
        result = { ok: false as const, message: "The search didn’t work. Try again." };
      }
      if (request !== latest.current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setResults(result.data);
      setSearchedFor(text.trim());
    });
  }

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value), SEARCH_DELAY_MS);
  }

  function add(item: PieceSearchResult) {
    if (adding) return;
    setAdding(item.productId);
    startAdding(async () => {
      let result;
      try {
        result = await addCollectionPieceAction({ collectionId, productId: item.productId });
      } catch {
        result = { ok: false as const, message: "That didn’t save. Refresh the page and try again." };
      }
      setAdding(null);
      if (!result.ok) {
        onAdded(result.message, "error");
        return;
      }
      setResults((current) => current?.filter((other) => other.productId !== item.productId) ?? null);
      onAdded(result.message ?? `Added “${item.name}” to ${collectionName}.`);
    });
  }

  const summary =
    results === null
      ? ""
      : results.length === 0
        ? searchedFor
          ? `Nothing matches “${searchedFor}” that isn’t already in this collection.`
          : "Every product is already in this collection."
        : searchedFor
          ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
          : "Recently changed products";

  return (
    <div className="mt-6 border-t pt-5">
      <h3 className="text-label">Add pieces</h3>
      <p className="mt-1 text-caption text-muted-foreground">
        Search by name or product code, or paste a SKU. Archived products aren’t listed.
      </p>
      <form
        role="search"
        className="relative mt-3 max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(timer.current);
          search(query);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search products to add to {collectionName}
        </label>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
        />
        <Input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => {
            if (results === null && !searching) search(query);
          }}
          placeholder="e.g. Linen shirt or KPL"
          autoComplete="off"
          maxLength={100}
          aria-controls={resultsId}
          className="h-10 pr-3 pl-9 text-body-sm"
        />
      </form>

      <div id={resultsId} className="mt-3" aria-busy={searching || undefined}>
        <p role="status" aria-live="polite" className="text-caption text-muted-foreground">
          {searching ? "Searching…" : summary}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-body-sm text-danger">
            {error}
          </p>
        ) : null}
        {results && results.length > 0 ? (
          <ul className={cn("mt-2 divide-y border transition-opacity", searching && "opacity-60")}>
            {results.map((item) => {
              const status = productStatusDisplay(item.status);
              return (
                <li key={item.productId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-10 shrink-0">
                    {item.thumb ? (
                      <MediaThumb media={item.thumb} alt="" sizes="2.5rem" />
                    ) : (
                      <div className="aspect-4/5 border border-dashed" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                      <span className="font-mono">{item.code}</span>
                      <span>{item.categoryName}</span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 px-3"
                    aria-disabled={adding !== null || undefined}
                    onClick={() => add(item)}
                  >
                    {adding === item.productId ? "Adding…" : "Add"}
                    <span className="sr-only"> {item.name}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
