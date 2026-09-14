"use client";

import * as React from "react";

import { ChevronDownIcon } from "@/components/icons";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
 * Labelled checkout fields. Errors sit under their field, linked with
 * aria-describedby and marked aria-invalid; they are announced through the form's
 * single alert rather than one alert per field, which would talk over itself.
 */

interface FieldFrameProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
}

function FieldFrame({ id, label, error, hint, optional, className, children }: FieldFrameProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </Label>
      {children(describedBy)}
      {hint ? (
        <p id={`${id}-hint`} className="mt-2 text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<React.ComponentProps<"input">, "id" | "value" | "onChange"> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export function TextField({ id, label, value, onValueChange, error, hint, optional, className, ...props }: TextFieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      {(describedBy) => (
        <Input
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={!optional}
          {...props}
        />
      )}
    </FieldFrame>
  );
}

type TextareaFieldProps = Omit<React.ComponentProps<"textarea">, "id" | "value" | "onChange"> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export function TextareaField({ id, label, value, onValueChange, error, hint, optional, className, ...props }: TextareaFieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      {(describedBy) => (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
      )}
    </FieldFrame>
  );
}

type SelectFieldProps = Omit<React.ComponentProps<"select">, "id" | "value" | "onChange"> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  error?: string;
  hint?: string;
};

export function SelectField({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  hint,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} className={className}>
      {(describedBy) => (
        <div className="relative">
          <select
            id={id}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            required
            className={cn(
              "h-12 w-full cursor-pointer appearance-none border border-input bg-transparent pr-10 pl-4 text-body",
              "transition-[border-color,box-shadow] duration-300 ease-editorial",
              "focus-visible:border-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--foreground)] focus-visible:outline-none",
              "aria-invalid:border-danger",
              value ? "text-foreground" : "text-muted-foreground",
            )}
            {...props}
          >
            <option value="" disabled>
              {placeholder}
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value} className="text-foreground">
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base"
          />
        </div>
      )}
    </FieldFrame>
  );
}
