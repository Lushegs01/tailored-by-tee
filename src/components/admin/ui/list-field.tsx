"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ChevronDownIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useAdminFieldError } from "./admin-form";
import { adminControlClassName } from "./field-styles";

export interface ListFieldProps {
  /** Every line is sent under this name (read it with zList). */
  name: string;
  /** The group's label, e.g. "Details". */
  label: string;
  /** What one line is called, for screen readers and the add button: "detail" → "Detail 2", "Add a detail". */
  itemLabel?: string;
  hint?: string;
  /**
   * Inside an AdminForm, read automatically (including "details.2" errors).
   * Otherwise pass fieldError(result.fieldErrors, name).
   */
  error?: string;
  defaultValue?: readonly string[];
  maxItems?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

interface Item {
  key: number;
  value: string;
}

/**
 * An editable list of short texts — product details, care instructions. Lines can
 * be added, removed and reordered; empty lines are dropped on save. Each line is a
 * plain input named `name`, so the form sends them in order.
 */
export function ListField({
  name,
  label,
  itemLabel = "line",
  hint,
  error: explicitError,
  defaultValue = [],
  maxItems = 20,
  maxLength = 300,
  placeholder,
  className,
}: ListFieldProps) {
  const error = useAdminFieldError(name, explicitError);
  const baseId = useId();
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const nextKey = useRef(defaultValue.length);
  const [items, setItems] = useState<Item[]>(() => defaultValue.map((value, key) => ({ key, value })));
  // Where focus should go once the list has re-rendered: an item's input, or the add button.
  const pendingFocus = useRef<number | "add" | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const defaults = useRef(defaultValue);

  useEffect(() => {
    defaults.current = defaultValue;
  });

  // Follow the form's reset (e.g. AdminForm's resetOnSuccess): back to the starting lines.
  useEffect(() => {
    const form = fieldsetRef.current?.form;
    if (!form) return;
    function onReset() {
      const start = nextKey.current;
      nextKey.current += defaults.current.length;
      setItems(defaults.current.map((value, index) => ({ key: start + index, value })));
    }
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "add") addRef.current?.focus();
    else listRef.current?.querySelector<HTMLInputElement>(`[data-item-key="${target}"]`)?.focus();
  }, [items]);

  const capitalised = itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1);
  const article = /^[aeiou]/i.test(itemLabel) ? "an" : "a";

  function add() {
    if (items.length >= maxItems) return;
    const key = nextKey.current++;
    setItems((current) => [...current, { key, value: "" }]);
    pendingFocus.current = key;
  }

  function remove(index: number) {
    const next = items.filter((_, position) => position !== index);
    setItems(next);
    const neighbour = next[index] ?? next[index - 1];
    pendingFocus.current = neighbour ? neighbour.key : "add";
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    pendingFocus.current = next[target].key;
  }

  return (
    <fieldset
      ref={fieldsetRef}
      className={cn("min-w-0", className)}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="mb-1.5 text-body-sm font-medium text-foreground">{label}</legend>
      {hint ? (
        <p id={hintId} className="-mt-0.5 mb-2 text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ol ref={listRef} className="space-y-2">
          {items.map((item, index) => (
            <li key={item.key} className="flex items-center gap-1">
              <span aria-hidden="true" className="w-5 shrink-0 text-caption tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
              <Input
                name={name}
                value={item.value}
                maxLength={maxLength}
                placeholder={placeholder}
                data-item-key={item.key}
                aria-label={`${capitalised} ${index + 1} of ${items.length}`}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, value } : entry)));
                }}
                className={cn(adminControlClassName, "min-w-0 flex-1")}
              />
              <ListButton
                label={`Move ${itemLabel} ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronDownIcon className="rotate-180" />
              </ListButton>
              <ListButton
                label={`Move ${itemLabel} ${index + 1} down`}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDownIcon />
              </ListButton>
              <ListButton label={`Remove ${itemLabel} ${index + 1}`} onClick={() => remove(index)}>
                <CloseIcon />
              </ListButton>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-1 text-caption text-muted-foreground">None yet.</p>
      )}

      <button
        ref={addRef}
        type="button"
        onClick={add}
        disabled={items.length >= maxItems}
        className="mt-2 inline-flex min-h-10 items-center gap-2 text-body-sm text-foreground transition-opacity hover:opacity-70 disabled:opacity-40"
      >
        <PlusIcon aria-hidden="true" className="text-base" />
        {items.length >= maxItems ? `Up to ${maxItems} lines` : `Add ${article} ${itemLabel}`}
      </button>

      {error ? (
        <p id={errorId} className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function ListButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-10 shrink-0 items-center justify-center text-base text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
