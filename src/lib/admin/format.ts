import { formatPrice } from "@/lib/format";

/*
 * Formatting for the admin area. Pure (no server or browser APIs), so server
 * pages, client forms and tests all agree.
 *
 * - Money is integer kobo everywhere (₦1 = 100 kobo). Admin figures never round
 *   away kobo: whole-naira amounts read like the storefront ("₦12,500"), anything
 *   else keeps its two decimals ("₦12,500.50").
 * - Dates are always shown in Lagos time, whatever time zone the server runs in.
 */

/** Largest value a Postgres INTEGER column holds: ₦21,474,836.47 in kobo. */
export const MAX_KOBO = 2_147_483_647;

const nairaWithKobo = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1_250_000 → "₦12,500"; 1_250_050 → "₦12,500.50"; -50_000 → "−₦500". For display only. */
export function formatKobo(kobo: number): string {
  if (!Number.isFinite(kobo)) return "—";
  const amount = Math.round(kobo);
  const sign = amount < 0 ? "−" : "";
  const absolute = Math.abs(amount);
  const text = absolute % 100 === 0 ? formatPrice(absolute) : nairaWithKobo.format(absolute / 100);
  return `${sign}${text}`;
}

const GROUPED = /^\d{1,3}(,\d{3})+$/;
const PLAIN = /^\d+$/;

/**
 * Reads a naira amount typed by a person into integer kobo, or null when it isn't
 * a clear, non-negative amount. Accepts "12500", "12,500", "12500.5", "12,500.50",
 * "₦12,500", "N12,500" and "NGN 12,500". Rejects negatives, more than two decimal
 * places, misplaced commas ("12,50"), anything else and amounts over MAX_KOBO.
 * Uses string arithmetic, so no floating-point rounding can creep in.
 */
export function parseNairaToKobo(input: string): number | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .trim()
    .replace(/^(₦|NGN|N)\s*/i, "")
    .trim();
  if (cleaned === "") return null;

  const match = /^([\d,]+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  if (!PLAIN.test(whole) && !GROUPED.test(whole)) return null;

  const naira = Number(whole.replaceAll(",", ""));
  const kobo = naira * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(kobo) || kobo > MAX_KOBO) return null;
  return kobo;
}

const grouping = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0, useGrouping: true });

/** A form field's starting value: 1_250_000 → "12,500"; 1_250_050 → "12,500.50"; null → "". */
export function koboToNairaInput(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined || !Number.isFinite(kobo)) return "";
  const amount = Math.max(0, Math.round(kobo));
  const whole = grouping.format(Math.floor(amount / 100));
  const fraction = amount % 100;
  return fraction === 0 ? whole : `${whole}.${String(fraction).padStart(2, "0")}`;
}

const counting = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

/** Counts and quantities with thousands separators: 1234 → "1,234"; "—" for nonsense. */
export function formatNumber(value: number): string {
  return Number.isFinite(value) ? counting.format(Math.round(value)).replace("-", "−") : "—";
}

/* ── Dates (Lagos time) ─────────────────────────────────────────────────── */

type DateInput = Date | string | number;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// en-US month names: en-GB and en-NG now spell September "Sept".
const lagosParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsOf(date: Date) {
  const parts = lagosParts.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { day: part("day"), month: part("month"), year: part("year"), hour: part("hour"), minute: part("minute") };
}

/** "14 Sep 2026" in Lagos time; "—" for an invalid date. */
export function formatAdminDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "—";
  const { day, month, year } = partsOf(date);
  return `${day} ${month} ${year}`;
}

/** "14 Sep 2026, 14:30" in Lagos time (24-hour clock); "—" for an invalid date. */
export function formatAdminDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "—";
  const { day, month, year, hour, minute } = partsOf(date);
  return `${day} ${month} ${year}, ${hour}:${minute}`;
}

// "always": "1 day ago" rather than "yesterday", which would be wrong for 30 hours ago at 9am.
const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "always" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "5 minutes ago", "3 hours ago", "4 days ago" (and the future:
 * "in 20 minutes"). Counts whole units, so 90 minutes is "1 hour ago". A week or
 * more away it gives the date instead ("14 Sep 2026"). Pass `now` for stable
 * output; render it on the server and pair it with the exact time (e.g.
 * <time title={formatAdminDateTime(date)}>), since it goes stale as time passes.
 */
export function formatRelative(value: DateInput, now: DateInput = new Date()): string {
  const date = toDate(value);
  const reference = toDate(now);
  if (!date || !reference) return "—";

  const diff = date.getTime() - reference.getTime();
  const distance = Math.abs(diff);
  const direction = diff < 0 ? -1 : 1;

  if (distance < 45_000) return "just now";
  if (distance < HOUR) return relative.format(direction * Math.max(1, Math.floor(distance / MINUTE)), "minute");
  if (distance < DAY) return relative.format(direction * Math.floor(distance / HOUR), "hour");
  if (distance < 7 * DAY) return relative.format(direction * Math.floor(distance / DAY), "day");
  return formatAdminDate(date);
}
