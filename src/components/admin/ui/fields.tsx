"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { Input, Label, Textarea } from "@/components/ui/input";
import { koboToNairaInput } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

import { useAdminFieldError } from "./admin-form";
import { adminControlClassName, adminSelectClassName } from "./field-styles";

/*
 * Labelled form fields for admin forms. Each wires its label, hint and error to
 * the control (htmlFor, aria-describedby, aria-invalid), so errors from a server
 * action appear next to the field and are read out when it's focused:
 *
 *   <AdminForm action={saveProduct}>
 *     <TextField name="name" label="Name" defaultValue={product.name} />
 *     <MoneyField name="price" label="Price" defaultKobo={product.price} />
 *   </AdminForm>
 *
 * Inside an AdminForm, `error` can be left out: each field finds its own message
 * in the form's latest result by `name`. Outside one, pass `error`. They are
 * client components, usable from server components with plain props. Sizes are
 * denser than the storefront's (h-10, body-sm). Re-validate everything in the
 * action (parseInput with the z* helpers in lib/admin/validation).
 */

export interface FieldBaseProps {
  /** The form field name (also the key in fieldErrors). */
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  /** The message for this field. Inside an AdminForm it is read from the form's result unless given here ("" hides it). */
  error?: string;
  /** Adds a quiet "(optional)" after the label. */
  optional?: boolean;
  /** Classes for the wrapper around label, control, hint and error. */
  className?: string;
  id?: string;
}

/** The chevron drawn over a native select; place it inside the select's `relative` wrapper. */
export function SelectChevron() {
  return (
    <ChevronDownIcon
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base text-muted-foreground"
    />
  );
}

/**
 * For custom fields: the ids and aria props a control needs, and the error to show
 * (`explicitError` when given, otherwise the surrounding AdminForm's error for `name`).
 */
export function useFieldIds(name: string, id: string | undefined, hint: ReactNode, explicitError?: string) {
  const error = useAdminFieldError(name, explicitError);
  const generated = useId();
  const controlId = id ?? `${name}-${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return {
    controlId,
    hintId,
    error,
    errorId,
    controlProps: { id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined },
  };
}

/** Label + control + hint + error, in that order. For building custom fields with useFieldIds. */
export function FieldShell({
  controlId,
  label,
  optional,
  hint,
  hintId,
  error,
  errorId,
  className,
  children,
}: {
  controlId: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  hintId?: string;
  error?: string;
  errorId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={controlId} className="mb-1.5">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </Label>
      {children}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type TextFieldProps = FieldBaseProps & Omit<ComponentProps<"input">, "name" | "id" | "className">;

/** A single-line text input. */
export function TextField({ name, label, hint, error, optional, className, id, ...inputProps }: TextFieldProps) {
  const ids = useFieldIds(name, id, hint, error);
  return (
    <FieldShell {...ids} label={label} optional={optional} hint={hint} className={className}>
      <Input name={name} className={adminControlClassName} {...ids.controlProps} {...inputProps} />
    </FieldShell>
  );
}

export type TextAreaFieldProps = FieldBaseProps & Omit<ComponentProps<"textarea">, "name" | "id" | "className">;

/** A multi-line text input (descriptions, notes). */
export function TextAreaField({
  name,
  label,
  hint,
  error,
  optional,
  className,
  id,
  rows = 4,
  ...textareaProps
}: TextAreaFieldProps) {
  const ids = useFieldIds(name, id, hint, error);
  return (
    <FieldShell {...ids} label={label} optional={optional} hint={hint} className={className}>
      <Textarea
        name={name}
        rows={rows}
        className="min-h-20 px-3 py-2 text-body-sm"
        {...ids.controlProps}
        {...textareaProps}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectFieldProps = FieldBaseProps &
  Omit<ComponentProps<"select">, "name" | "id" | "className" | "children"> & {
    options: readonly SelectOption[];
    /** Adds an empty first option with this text, e.g. "Choose a category". */
    placeholder?: string;
  };

/** A native select (the phone's own picker, full keyboard support). */
export function SelectField({
  name,
  label,
  hint,
  error,
  optional,
  className,
  id,
  options,
  placeholder,
  ...selectProps
}: SelectFieldProps) {
  const ids = useFieldIds(name, id, hint, error);
  return (
    <FieldShell {...ids} label={label} optional={optional} hint={hint} className={className}>
      <div className="relative">
        <select name={name} className={adminSelectClassName} {...ids.controlProps} {...selectProps}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
    </FieldShell>
  );
}

export type CheckboxFieldProps = FieldBaseProps & Omit<ComponentProps<"input">, "name" | "id" | "className" | "type">;

/** A checkbox with its label beside it. Sends "on" when ticked (read it with zCheckbox). */
export function CheckboxField({ name, label, hint, error, className, id, ...inputProps }: CheckboxFieldProps) {
  const ids = useFieldIds(name, id, hint, error);
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      <input
        type="checkbox"
        name={name}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed"
        {...ids.controlProps}
        {...inputProps}
      />
      <div className="min-w-0">
        <label htmlFor={ids.controlId} className="block cursor-pointer text-body-sm leading-5 font-medium">
          {label}
        </label>
        {hint ? (
          <p id={ids.hintId} className="mt-0.5 text-caption text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {ids.error ? (
          <p id={ids.errorId} className="mt-0.5 text-caption text-danger">
            {ids.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type MoneyFieldProps = FieldBaseProps &
  Omit<ComponentProps<"input">, "name" | "id" | "className" | "type" | "defaultValue" | "value"> & {
    /** Starting amount in kobo (shown as naira). */
    defaultKobo?: number | null;
  };

/**
 * A naira amount with a ₦ prefix. The person types naira ("12,500" or "12,500.50");
 * parse it on the server with zNaira / parseNairaToKobo, which give integer kobo.
 */
export function MoneyField({
  name,
  label,
  hint,
  error,
  optional,
  className,
  id,
  defaultKobo,
  ...inputProps
}: MoneyFieldProps) {
  const ids = useFieldIds(name, id, hint, error);
  return (
    <FieldShell
      {...ids}
      label={
        <>
          {label}
          <span className="sr-only"> in naira</span>
        </>
      }
      optional={optional}
      hint={hint}
      className={className}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body-sm text-muted-foreground"
        >
          ₦
        </span>
        <Input
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          defaultValue={koboToNairaInput(defaultKobo)}
          className={cn(adminControlClassName, "pl-7 tabular-nums")}
          {...ids.controlProps}
          {...inputProps}
        />
      </div>
    </FieldShell>
  );
}

export type NumberFieldProps = FieldBaseProps &
  Omit<ComponentProps<"input">, "name" | "id" | "className" | "type"> & {
    /** Allow a minus sign (e.g. stock corrections). Phones then show the full keyboard. */
    allowNegative?: boolean;
    /** A unit after the input, e.g. "pieces". */
    suffix?: string;
  };

/**
 * A whole-number input. A text input with a numeric keyboard rather than
 * type="number", which changes value on scroll and accepts "1e5". Parse with zInt.
 */
export function NumberField({
  name,
  label,
  hint,
  error,
  optional,
  className,
  id,
  allowNegative = false,
  suffix,
  ...inputProps
}: NumberFieldProps) {
  const ids = useFieldIds(name, id, hint, error);
  return (
    <FieldShell {...ids} label={label} optional={optional} hint={hint} className={className}>
      <div className="flex items-center gap-2">
        <Input
          name={name}
          type="text"
          inputMode={allowNegative ? "text" : "numeric"}
          autoComplete="off"
          className={cn(adminControlClassName, "tabular-nums")}
          {...ids.controlProps}
          {...inputProps}
        />
        {suffix ? <span className="shrink-0 text-body-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    </FieldShell>
  );
}
