"use client";

import { useId, useMemo, useRef, useState } from "react";

import { useAdminFieldError } from "@/components/admin/ui/admin-form";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import type { RestrictionOption } from "@/lib/admin/discounts";
import { cn } from "@/lib/utils";

/*
 * A searchable multi-select for what a discount applies to (categories or
 * products). Built from plain parts so it works with any keyboard and screen
 * reader: a list of the chosen items with Remove buttons, a search box, and a
 * scrolling list of checkboxes. The chosen ids are sent as hidden inputs named
 * `name`, so ones hidden by the search are still saved.
 */

export interface RestrictionPickerProps {
  /** The form field sent for each chosen id: "categoryIds" or "productIds". */
  name: string;
  legend: string;
  hint?: string;
  options: readonly RestrictionOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  noun: { one: string; other: string };
  /** Show the search box when there are more options than this. Default 8. */
  searchFrom?: number;
}

/** Rows drawn at once; search narrows the rest. */
const MAX_SHOWN = 100;

function matches(option: RestrictionOption, words: string[]): boolean {
  const text = `${option.name} ${option.detail ?? ""} ${option.note ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

export function RestrictionPicker({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  noun,
  searchFrom = 8,
}: RestrictionPickerProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const error = useAdminFieldError(name);
  const errorId = error ? `${id}-error` : undefined;
  const searchId = `${id}-search`;
  const listId = `${id}-list`;
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const chosen = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length > 0 ? options.filter((option) => matches(option, words)) : options;
  const shown = found.slice(0, MAX_SHOWN);
  const searchable = options.length > searchFrom;

  function toggle(optionId: string, checked: boolean) {
    onChange(checked ? [...value.filter((item) => item !== optionId), optionId] : value.filter((item) => item !== optionId));
  }

  function remove(optionId: string) {
    onChange(value.filter((item) => item !== optionId));
    // The button goes with the item: keep focus in the picker.
    requestAnimationFrame(() => {
      (searchRef.current ?? listRef.current?.querySelector<HTMLInputElement>("input[type=checkbox]"))?.focus();
    });
  }

  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset className="min-w-0" aria-describedby={describedBy}>
      <legend className="mb-1.5 text-body-sm font-medium">
        {legend}
        <span className="font-normal text-muted-foreground"> (optional)</span>
      </legend>
      {hint ? (
        <p id={hintId} className="mb-3 text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {value.length > 0 ? (
        <div className="mb-3">
          <p className="sr-only">
            {value.length} {value.length === 1 ? noun.one : noun.other} chosen:
          </p>
          <ul className="flex flex-wrap gap-2">
            {value.map((optionId) => {
              const label = byId.get(optionId)?.name ?? `Unknown ${noun.one}`;
              return (
                <li key={optionId} className="inline-flex max-w-full items-center border border-foreground/40 text-caption">
                  <span className="min-w-0 truncate py-1 pl-2.5">{label}</span>
                  <button
                    type="button"
                    onClick={() => remove(optionId)}
                    aria-label={`Remove ${label}`}
                    title="Remove"
                    className="inline-flex size-8 shrink-0 items-center justify-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <CloseIcon />
                  </button>
                </li>
              );
            })}
          </ul>
          {value.length > 1 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 inline-flex min-h-8 items-center text-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="link-underline-static pb-0.5">Clear all {noun.other}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {options.length === 0 ? (
        <p className="border px-3 py-3 text-caption text-muted-foreground">There are no {noun.other} yet.</p>
      ) : (
        <>
          {searchable ? (
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                Search {noun.other}
              </label>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
              />
              <Input
                ref={searchRef}
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Enter narrows the list; it must never submit the whole discount form.
                  if (event.key === "Enter") event.preventDefault();
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder={`Search ${noun.other}`}
                aria-controls={listId}
                aria-invalid={error ? true : undefined}
                aria-describedby={errorId}
                className="h-10 pl-9 text-body-sm"
              />
            </div>
          ) : null}

          <div
            ref={listRef}
            id={listId}
            role="group"
            aria-label={`${legend}: choices`}
            className={cn("max-h-64 divide-y overflow-y-auto overscroll-contain border", searchable && "mt-2")}
          >
            {shown.map((option) => {
              const checked = chosen.has(option.id);
              return (
                <label
                  key={option.id}
                  className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 transition-colors hover:bg-surface/60 has-[:focus-visible]:bg-surface/60"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggle(option.id, event.target.checked)}
                    aria-invalid={!searchable && error ? true : undefined}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-foreground"
                  />
                  <span className="min-w-0">
                    <span className="block text-body-sm break-words">
                      {option.name}
                      {option.note ? <span className="text-caption text-muted-foreground"> · {option.note}</span> : null}
                    </span>
                    {option.detail ? (
                      <span className="block text-caption break-words text-muted-foreground">{option.detail}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
            {shown.length === 0 ? (
              <p className="px-3 py-3 text-caption text-muted-foreground">
                No {noun.other} match “{query.trim()}”.
              </p>
            ) : null}
          </div>
          {found.length > shown.length ? (
            <p className="mt-1.5 text-caption text-muted-foreground">
              Showing the first {MAX_SHOWN} of {found.length}. Search to find the others.
            </p>
          ) : null}
          {searchable ? (
            <p aria-live="polite" className="sr-only">
              {words.length > 0 ? `${found.length} ${found.length === 1 ? noun.one : noun.other} found` : ""}
            </p>
          ) : null}
        </>
      )}

      {value.map((optionId) => (
        <input key={optionId} type="hidden" name={name} value={optionId} />
      ))}

      {error ? (
        <p id={errorId} className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
