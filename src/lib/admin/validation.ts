import { z } from "zod";

import type { FieldErrors } from "./field-errors";
import { MAX_KOBO, parseNairaToKobo } from "./format";

export { fieldError, type FieldErrors } from "./field-errors";

/*
 * Input validation for admin server actions and route handlers. Pure (zod only),
 * so it can also run in the browser for instant hints — but the server always
 * re-parses: nothing the browser checked is trusted.
 *
 *   const schema = z.object({ name: zText({ max: 120, required: "Enter a name." }), price: zNaira() });
 *   const parsed = parseInput(schema, formData);
 *   if (!parsed.ok) return parsed;           // already an AdminActionResult failure
 *   parsed.data.price                          // integer kobo
 */

export type ParseInputResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors: FieldErrors };

const CHECK_FIELDS = "Please check the highlighted fields.";

/**
 * FormData → plain object. A key sent once becomes a string (or File), a key sent
 * several times (checkbox groups, ListField) becomes an array. Next's internal
 * "$ACTION…" fields are dropped.
 */
export function formDataToObject(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const result: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return result;
}

/**
 * Validates `input` (FormData or any value) against `schema`. Failures come back
 * shaped like an AdminActionResult failure, with zod issues mapped to field paths.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): ParseInputResult<z.output<S>> {
  const value = typeof FormData !== "undefined" && input instanceof FormData ? formDataToObject(input) : input;
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  let rootMessage: string | undefined;
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join(".");
    if (!path) {
      rootMessage ??= issue.message;
      continue;
    }
    fieldErrors[path] ??= issue.message;
  }
  return { ok: false, message: rootMessage ?? CHECK_FIELDS, fieldErrors };
}

/* ── Form field schemas ───────────────────────────────────────────────────
 * Each accepts what a form actually sends (strings, missing keys) and outputs
 * the typed value. Messages are plain sentences for the owner.
 */

const asString = (value: unknown) => (typeof value === "string" ? value : value === undefined || value === null ? "" : value);

/** Trimmed text. `required` is the message shown when it's empty; without it, "" is allowed. */
export function zText(options: { max?: number; min?: number; required?: string; label?: string } = {}) {
  const { max = 500, min, required, label = "This" } = options;
  let schema = z.string({ error: required ?? "Enter some text." }).trim();
  if (required) schema = schema.min(1, required);
  if (min !== undefined) schema = schema.min(min, `${label} needs at least ${min} characters.`);
  schema = schema.max(max, `${label} must be ${max} characters or fewer.`);
  return z.preprocess(asString, schema);
}

/** Trimmed text, or null when empty. */
export function zOptionalText(options: { max?: number; label?: string } = {}) {
  const { max = 500, label = "This" } = options;
  return z.preprocess(
    asString,
    z
      .string()
      .trim()
      .max(max, `${label} must be ${max} characters or fewer.`)
      .transform((value) => (value === "" ? null : value)),
  );
}

/** A checkbox: "on", "true", "1" or "yes" is true; missing is false. */
export function zCheckbox() {
  return z.preprocess((value) => {
    const text = Array.isArray(value) ? value.at(-1) : value;
    return typeof text === "string" ? ["on", "true", "1", "yes"].includes(text.toLowerCase()) : text === true;
  }, z.boolean());
}

const WHOLE_NUMBER = /^-?\d+$/;

/** A whole number typed into a field (commas allowed), within min/max. */
export function zInt(options: { min?: number; max?: number; required?: string; label?: string } = {}) {
  const { min = 0, max = MAX_KOBO, required = "Enter a whole number.", label = "This" } = options;
  return z.preprocess(
    (value) => {
      if (typeof value === "number") return value;
      const text = typeof value === "string" ? value.trim().replaceAll(",", "") : "";
      return WHOLE_NUMBER.test(text) ? Number(text) : text === "" ? undefined : Number.NaN;
    },
    z
      .number({ error: (issue) => (issue.input === undefined ? required : "Enter a whole number.") })
      .int("Enter a whole number.")
      .min(min, `${label} must be ${min} or more.`)
      .max(max, `${label} must be ${max} or less.`),
  );
}

/** Like zInt, but an empty field gives null. */
export function zOptionalInt(options: { min?: number; max?: number; label?: string } = {}) {
  const inner = zInt(options);
  return z.preprocess(
    (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value),
    inner.nullable(),
  );
}

/** A naira amount typed by a person (see parseNairaToKobo), output as integer kobo. */
export function zNaira(options: { min?: number; max?: number; required?: string; label?: string } = {}) {
  const { min = 0, max = MAX_KOBO, required = "Enter an amount.", label = "The amount" } = options;
  return z.preprocess(
    (value) => {
      if (typeof value !== "string" || value.trim() === "") return undefined;
      return parseNairaToKobo(value) ?? Number.NaN;
    },
    z
      .number({
        error: (issue) =>
          issue.input === undefined ? required : "Enter an amount in naira, e.g. 12,500 or 12,500.50.",
      })
      .int()
      .min(min, `${label} must be at least ${formatMinimum(min)}.`)
      .max(max, `${label} is too large.`),
  );
}

/** Like zNaira, but an empty field gives null (e.g. "compare-at price"). */
export function zOptionalNaira(options: { min?: number; max?: number; label?: string } = {}) {
  const inner = zNaira(options);
  return z.preprocess(
    (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value),
    inner.nullable(),
  );
}

function formatMinimum(kobo: number): string {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

/** A list of short texts (ListField, repeated inputs): trimmed, empties dropped. */
export function zList(options: { maxItems?: number; maxLength?: number; label?: string } = {}) {
  const { maxItems = 20, maxLength = 300, label = "Each line" } = options;
  return z.preprocess(
    (value) => {
      const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
      return values.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    },
    z
      .array(z.string().max(maxLength, `${label} must be ${maxLength} characters or fewer.`))
      .max(maxItems, `Add no more than ${maxItems} lines.`),
  );
}

/** A database id from a hidden field or route param (cuid or seeded slug-style id). */
export function zId(message = "Something is missing from this form. Refresh the page and try again.") {
  return z.preprocess(asString, z.string({ error: message }).trim().regex(/^[A-Za-z0-9_.:-]{1,191}$/, message));
}

/** One of a fixed set of values (a select or radio group). */
export function zOneOf<const T extends readonly [string, ...string[]]>(values: T, message = "Choose one of the options.") {
  return z.preprocess(asString, z.enum(values, { error: message }));
}
