"use client";

import { useEffect, useId, type ReactNode } from "react";

import { useAdminFieldError } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/admin/format";
import type { StockLevel } from "@/lib/admin/stock-state";
import { cn } from "@/lib/utils";

/*
 * Pieces shared by the stock dialogs (adjust, count, low-stock level).
 */

/** On hand, held and available as three figures, so the owner sees what they're changing. */
export function CurrentLevels({ level, className }: { level: StockLevel; className?: string }) {
  const available = Math.max(0, level.onHand - level.reserved);
  const figures = [
    { label: "On hand", value: level.onHand },
    { label: "Held for unpaid orders", value: level.reserved },
    { label: "Available to sell", value: available },
  ];
  return (
    <dl className={cn("grid grid-cols-3 divide-x border", className)}>
      {figures.map((figure) => (
        <div key={figure.label} className="flex min-w-0 flex-col justify-between gap-1 px-3 py-2.5">
          <dt className="text-caption text-muted-foreground">{figure.label}</dt>
          <dd className="text-body font-medium tabular-nums">{formatNumber(figure.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * A group of radio choices with a legend, optional hints and its error from the
 * surrounding AdminForm (by `name`). Controlled, so the form can preview the result.
 */
export function ChoiceFieldset<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 2,
  className,
}: {
  name: string;
  legend: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 1 | 2;
  className?: string;
}) {
  const error = useAdminFieldError(name);
  const id = useId();
  const legendId = `${id}-legend`;
  const errorId = `${id}-error`;

  return (
    // A radiogroup carries the invalid state (radios can't), and takes focus when
    // AdminForm moves to the first invalid field after a refused save.
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      tabIndex={error ? -1 : undefined}
      className={cn("min-w-0 outline-offset-4", className)}
    >
      <legend id={legendId} className="mb-1.5 text-body-sm font-medium">
        {legend}
      </legend>
      <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="flex min-w-0 cursor-pointer items-start gap-3 border px-3 py-2.5 transition-colors duration-150 hover:border-border-strong has-checked:border-foreground"
            >
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-foreground"
              />
              <span className="min-w-0">
                <span className="block text-body-sm leading-5 font-medium">{option.label}</span>
                {option.hint ? (
                  <span className="mt-0.5 block text-caption text-muted-foreground">{option.hint}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Tells the dialog around a form whether it's saving, so it can't be closed halfway. */
export function PendingReporter({
  pending,
  onChange,
}: {
  pending: boolean;
  onChange?: (pending: boolean) => void;
}) {
  useEffect(() => {
    onChange?.(pending);
  }, [pending, onChange]);
  return null;
}

/** The save and cancel buttons under a stock form. */
export function StockFormActions({
  pending,
  onCancel,
  children,
}: {
  pending: boolean;
  onCancel: () => void;
  /** The SubmitButton. */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
      {children}
    </div>
  );
}

/** A preview line under a field: what saving would do, or why it can't. */
export function PreviewLine({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning";
  children: ReactNode;
}) {
  return <span className={cn(tone === "warning" ? "text-danger" : "text-foreground")}>{children}</span>;
}
