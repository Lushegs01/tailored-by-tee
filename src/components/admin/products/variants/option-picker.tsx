"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

import { useAdminFieldError } from "@/components/admin/ui";
import { SearchIcon } from "@/components/icons";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
 * The list behind "Add colours" and "Add sizes": every entry in the shared
 * registry the product doesn't already have, with a search box.
 *
 * Searching hides entries rather than unmounting them, so something ticked and
 * then searched past is still sent with the form. The count of what's ticked is
 * always visible, for the same reason.
 */

export interface PickerItem {
  id: string;
  /** The entry's name, e.g. "Sand" or "XL". */
  label: string;
  /** Everything else searchable: the code, the size system. */
  keywords?: string;
  /** A quiet second line, e.g. "SND · used by 4 products". */
  caption?: ReactNode;
  /** A swatch or other mark before the name. */
  leading?: ReactNode;
}

export interface OptionPickerProps {
  /** The form field each ticked entry is sent as, e.g. "colorId". */
  name: string;
  /** The fieldset's question, e.g. "Colours to add". */
  legend: string;
  items: readonly PickerItem[];
  searchLabel: string;
  searchPlaceholder: string;
  /** Shown instead of the list when there is nothing left to add. */
  empty: ReactNode;
  /** Ticked when the dialog opens. */
  defaultSelected?: readonly string[];
  noun: { one: string; other: string };
}

export function OptionPicker({
  name,
  legend,
  items,
  searchLabel,
  searchPlaceholder,
  empty,
  defaultSelected,
  noun,
}: OptionPickerProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(defaultSelected ?? []));
  const [query, setQuery] = useState("");
  const error = useAdminFieldError(name);
  const searchId = useId();
  const errorId = useId();

  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return null;
    return new Set(
      items
        .filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(needle))
        .map((item) => item.id),
    );
  }, [items, needle]);

  const chosen = items.filter((item) => selected.has(item.id)).length;
  const hidden = matches ? items.length - matches.size : 0;

  function toggle(id: string, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (items.length === 0) return <div className="text-body-sm text-muted-foreground">{empty}</div>;

  return (
    <fieldset className="min-w-0" aria-describedby={error ? errorId : undefined}>
      <legend className="sr-only">{legend}</legend>

      {items.length > 8 ? (
        <div className="mb-4">
          <Label htmlFor={searchId} className="mb-1.5">
            {searchLabel}
          </Label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              autoComplete="off"
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 pl-9 text-body-sm"
            />
          </div>
        </div>
      ) : null}

      <ul className="max-h-[22rem] divide-y overflow-y-auto overscroll-contain border">
        {items.map((item) => {
          const shown = !matches || matches.has(item.id);
          const checked = selected.has(item.id);
          return (
            <li key={item.id} hidden={!shown} className={cn(!shown && "hidden")}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface",
                  checked && "bg-surface",
                )}
              >
                <input
                  type="checkbox"
                  name={name}
                  value={item.id}
                  checked={checked}
                  onChange={(event) => toggle(item.id, event.target.checked)}
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-foreground"
                />
                {item.leading ? <span className="mt-0.5 shrink-0">{item.leading}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-medium">{item.label}</span>
                  {item.caption ? (
                    <span className="mt-0.5 block text-caption text-muted-foreground">{item.caption}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="mt-2 text-caption text-muted-foreground">
        {chosen === 0 ? `No ${noun.other} chosen yet.` : `${chosen} ${chosen === 1 ? noun.one : noun.other} chosen.`}
        {matches && hidden > 0 ? ` ${hidden} hidden by your search.` : ""}
        {matches && matches.size === 0 ? " Nothing matches your search." : ""}
      </p>

      {error ? (
        <p id={errorId} className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
