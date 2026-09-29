"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CheckIcon, CloseIcon } from "@/components/icons";
import type { ProductStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/*
 * The client side of the product list: which products are ticked for a bulk step,
 * and the confirmation line shown afterwards.
 *
 * The server renders the list itself; this holds only what the browser needs
 * between renders. After every change the server re-renders the page, and ticks
 * for products that have left it are forgotten.
 */

/** A product on this page, as the bulk bar needs it. */
export interface ProductItem {
  id: string;
  name: string;
  status: ProductStatus;
  /** It passes the publish checklist right now. */
  readyToPublish: boolean;
}

interface Feedback {
  text: string;
  tone: "success" | "error";
  key: number;
}

interface ProductSelectionContext {
  items: readonly ProductItem[];
  selected: readonly ProductItem[];
  isSelected: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  selectAll: (on: boolean) => void;
  clearSelection: () => void;
  announce: (text: string, tone?: "success" | "error") => void;
}

const Context = createContext<ProductSelectionContext | null>(null);

export function useProductSelection(): ProductSelectionContext {
  const context = useContext(Context);
  if (!context) throw new Error("useProductSelection must be used inside ProductSelectionProvider.");
  return context;
}

const VISIBLE_MS = 12_000;

export function ProductSelectionProvider({
  items,
  children,
}: {
  items: readonly ProductItem[];
  children: ReactNode;
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [message, setMessage] = useState<Feedback | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Counts announcements rather than timing them, so the same sentence twice
  // running still remounts the live region and is read out again.
  const announced = useRef(0);

  // A new page, search or filter: forget ticks for products no longer shown.
  const [seenItems, setSeenItems] = useState(items);
  if (seenItems !== items) {
    setSeenItems(items);
    const onPage = new Set(items.map((item) => item.id));
    if ([...ticked].some((id) => !onPage.has(id))) {
      setTicked(new Set([...ticked].filter((id) => onPage.has(id))));
    }
  }

  const selected = useMemo(() => items.filter((item) => ticked.has(item.id)), [items, ticked]);
  const isSelected = useCallback((id: string) => ticked.has(id), [ticked]);

  const toggle = useCallback((id: string, on: boolean) => {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (on: boolean) => setTicked(on ? new Set(items.map((item) => item.id)) : new Set()),
    [items],
  );

  const clearSelection = useCallback(() => setTicked(new Set()), []);

  const announce = useCallback((text: string, tone: "success" | "error" = "success") => {
    clearTimeout(timer.current);
    announced.current += 1;
    setMessage({ text, tone, key: announced.current });
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo<ProductSelectionContext>(
    () => ({ items, selected, isSelected, toggle, selectAll, clearSelection, announce }),
    [items, selected, isSelected, toggle, selectAll, clearSelection, announce],
  );

  const success = message?.tone === "success" ? message : null;
  const failure = message?.tone === "error" ? message : null;

  return (
    <Context.Provider value={value}>
      {children}

      <div
        className={cn(
          "pointer-events-none fixed inset-x-4 z-40 flex justify-end md:inset-x-8",
          selected.length > 0 ? "bottom-40 sm:bottom-28 lg:bottom-20" : "bottom-4",
        )}
      >
        <div className="w-full max-w-md">
          {/* Both regions are always present, so every new message is announced. */}
          <div role="status" aria-live="polite">
            {success ? <Toast key={success.key} message={success} onDismiss={() => setMessage(null)} /> : null}
          </div>
          <div role="alert">
            {failure ? <Toast key={failure.key} message={failure} onDismiss={() => setMessage(null)} /> : null}
          </div>
        </div>
      </div>
    </Context.Provider>
  );
}

function Toast({ message, onDismiss }: { message: Feedback; onDismiss: () => void }) {
  const error = message.tone === "error";
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 border py-3 pr-1 pl-4 text-body-sm transition-opacity duration-300 starting:opacity-0",
        error ? "border-danger bg-background-raised text-danger" : "border-foreground bg-foreground text-background",
      )}
    >
      {error ? null : <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />}
      <p className="min-w-0 flex-1 py-px break-words">{message.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        title="Dismiss"
        className="-my-2 inline-flex size-10 shrink-0 items-center justify-center text-base transition-opacity hover:opacity-70"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

const checkboxClassName = "size-4 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed";

/** The tick box on one product's row. Its label is read by screen readers only. */
export function ProductSelectBox({ id, name }: { id: string; name: string }) {
  const { isSelected, toggle } = useProductSelection();

  return (
    // A 40px target around the 16px box, sitting above the row link.
    <label className="relative z-10 -m-3 inline-flex cursor-pointer p-3">
      <input
        type="checkbox"
        checked={isSelected(id)}
        onChange={(event) => toggle(id, event.target.checked)}
        className={checkboxClassName}
      />
      <span className="sr-only">Select {name}</span>
    </label>
  );
}

/** "Select all on this page", with how many are ticked. */
export function ProductSelectAll() {
  const { items, selected, selectAll } = useProductSelection();
  const ref = useRef<HTMLInputElement>(null);
  const all = items.length > 0 && selected.length === items.length;
  const some = selected.length > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1">
      <label className="-my-2 -ml-3 inline-flex cursor-pointer items-center gap-3 py-2 pl-3 text-body-sm">
        <input
          ref={ref}
          type="checkbox"
          checked={all}
          disabled={items.length === 0}
          onChange={() => selectAll(!all)}
          className={checkboxClassName}
        />
        Select all on this page
      </label>
      <p aria-live="polite" className="text-caption text-muted-foreground tabular-nums">
        {selected.length > 0 ? `${selected.length} of ${items.length} selected` : ""}
      </p>
    </div>
  );
}
