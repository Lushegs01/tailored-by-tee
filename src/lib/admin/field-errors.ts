/*
 * Field errors as admin actions return them (AdminActionResult.fieldErrors).
 * Kept apart from validation.ts, which imports zod, so client forms can read
 * errors without shipping zod to the browser.
 */

/** Field errors keyed by field path ("price", "details.2", "address.city"); the first message per field. */
export type FieldErrors = Record<string, string>;

/**
 * The error for a field, including errors on its parts: fieldError(errors, "details")
 * finds "details" or, failing that, the first "details.N" message.
 */
export function fieldError(fieldErrors: FieldErrors | undefined, name: string): string | undefined {
  if (!fieldErrors) return undefined;
  if (fieldErrors[name]) return fieldErrors[name];
  const prefix = `${name}.`;
  for (const [key, message] of Object.entries(fieldErrors)) {
    if (key.startsWith(prefix)) return message;
  }
  return undefined;
}
