/*
 * CSV for spreadsheet exports, safe to open in Excel, Numbers or Google Sheets.
 * Pure, so it is unit-tested.
 *
 * - Every text cell is quoted (commas, quotes and line breaks survive).
 * - Formula injection: a text cell that a spreadsheet would read as a formula
 *   (starting with =, +, -, @, a tab or carriage return — after any spaces, and
 *   the full-width forms too) gets a leading apostrophe, so it shows as text and
 *   never runs. Numbers are written as plain numbers and never prefixed.
 * - Lines end in CRLF (RFC 4180), and the file starts with a byte-order mark so
 *   Excel reads ₦ and accented names as UTF-8.
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[\s\u3000]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r\n]/;

/** One cell. Text is quoted and defused; finite numbers are written as they are; empty values are empty. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** A whole CSV document (with BOM) from a header row and data rows. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
