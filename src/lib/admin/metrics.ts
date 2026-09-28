import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { siteConfig } from "@/config/site";

/*
 * The overview's figures (/admin): sales for a chosen period, the work waiting
 * today, stock that needs attention and the latest orders.
 *
 * Two halves in one file:
 * - Pure helpers (periods, Lagos calendar days, chart buckets, comparisons, the
 *   chart's axis): no server or browser APIs, tested in metrics.test.ts.
 * - Queries (getSalesOverview, getWorkQueue, getStockWatch, getRecentOrders): one
 *   aggregate statement each, started together by the page so they run side by
 *   side. Each loads the database client when it runs (lib/db is server-only), so
 *   the tests can import this file; a client component importing it would still
 *   fail the build on lib/db, as it should (client components get their figures
 *   as props instead). None of them throws: a failure is logged and returned as
 *   { ok: false, reason }, so one section can say it didn't load while the rest
 *   of the page works.
 *
 * What the numbers mean (the page repeats this to the owner in plain words):
 * - A sale is an order that was paid and is going ahead — PAID, PROCESSING, SHIPPED
 *   or DELIVERED — counted on the Lagos day Paystack says it was paid. Cancelled
 *   orders (a paid one is a refund due, not a sale) and refunded orders are not
 *   sales, and money returned by a processed partial refund is taken off.
 * - Demo orders (Order.isDemo) never count.
 * - Test-mode sales (every successful payment made with Paystack test keys) are
 *   kept apart from real ones and never added to them.
 * - A period is a run of whole Lagos calendar days ending today; it is compared
 *   with the same length of time just before it, up to the same moment (so today
 *   so far is compared with yesterday up to this time, not with all of yesterday).
 */

/* ── Periods ────────────────────────────────────────────────────────────── */

/** The shop's clock. West Africa Time is UTC+1 all year (no summer time). */
export const ADMIN_TIME_ZONE = "Africa/Lagos";

export type OverviewPeriod = "today" | "7d" | "30d" | "90d";

export interface OverviewPeriodOption {
  value: OverviewPeriod;
  /** The switch's word: "7 days". */
  label: string;
  /** Lagos calendar days covered, today included. */
  days: number;
  /** What a change is measured against: "↑ 12% vs {comparison}". */
  comparison: string;
}

export const OVERVIEW_PERIODS: readonly OverviewPeriodOption[] = [
  { value: "today", label: "Today", days: 1, comparison: "yesterday by this time" },
  { value: "7d", label: "7 days", days: 7, comparison: "the 7 days before" },
  { value: "30d", label: "30 days", days: 30, comparison: "the 30 days before" },
  { value: "90d", label: "90 days", days: 90, comparison: "the 90 days before" },
];

export const DEFAULT_OVERVIEW_PERIOD: OverviewPeriod = "30d";

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** ?period= from the URL; anything unknown is the default (30 days). */
export function parseOverviewPeriod(value: unknown): OverviewPeriod {
  const text = firstValue(value);
  return OVERVIEW_PERIODS.find((option) => option.value === text)?.value ?? DEFAULT_OVERVIEW_PERIOD;
}

export function overviewPeriodOption(period: OverviewPeriod): OverviewPeriodOption {
  return OVERVIEW_PERIODS.find((option) => option.value === period) ?? OVERVIEW_PERIODS[2];
}

/** Real sales (default), or payments made with Paystack test keys — shown one at a time, never mixed. */
export type SalesMode = "live" | "test";

/** ?mode= from the URL: "test" shows test payments; anything else shows real sales. */
export function parseSalesMode(value: unknown): SalesMode {
  return firstValue(value) === "test" ? "test" : "live";
}

/** The overview's URL for a period and mode, leaving defaults out: "/admin", "/admin?period=7d&mode=test". */
export function overviewHref(period: OverviewPeriod, mode: SalesMode): string {
  const search = new URLSearchParams();
  if (period !== DEFAULT_OVERVIEW_PERIOD) search.set("period", period);
  if (mode !== "live") search.set("mode", mode);
  const query = search.toString();
  return query ? `/admin?${query}` : "/admin";
}

/* ── Lagos calendar days ────────────────────────────────────────────────── */

/** A date on the Lagos calendar; `month` is 1–12. */
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

const HOUR_MS = 3_600_000;

const lagosClock = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function wallClock(instant: Date) {
  const parts = lagosClock.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour") % 24,
    minute: part("minute"),
    second: part("second"),
  };
}

/** How far Lagos wall-clock time is ahead of UTC at `instant`, in milliseconds. */
function lagosOffsetMs(instant: number): number {
  const clock = wallClock(new Date(instant));
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The Lagos calendar day an instant falls on. */
export function lagosCalendarDay(instant: Date): CalendarDay {
  const { year, month, day } = wallClock(instant);
  return { year, month, day };
}

/** `amount` days after (or before) a calendar day, across months and years. */
export function addCalendarDays(date: CalendarDay, amount: number): CalendarDay {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** Midnight at the start of a Lagos calendar day, as an instant. */
export function startOfLagosDay(date: CalendarDay): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day);
  // Twice, so the offset is the one in force at the answer rather than at the guess.
  const guess = wall - lagosOffsetMs(wall);
  return new Date(wall - lagosOffsetMs(guess));
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** "2026-09-16". */
export function calendarDayKey(date: CalendarDay): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

export type SalesGranularity = "day" | "hour";

/**
 * The chart bucket an instant falls in, in Lagos time: "2026-09-16" by day,
 * "2026-09-16T14" by hour. SALES_BUCKET_SQL_FORMAT produces the same keys in SQL.
 */
export function lagosBucketKey(instant: Date, granularity: SalesGranularity): string {
  const clock = wallClock(instant);
  const day = calendarDayKey(clock);
  return granularity === "hour" ? `${day}T${pad(clock.hour)}` : day;
}

/** Postgres to_char patterns matching lagosBucketKey, applied to a Lagos wall-clock timestamp. */
export const SALES_BUCKET_SQL_FORMAT: Record<SalesGranularity, string> = {
  day: "YYYY-MM-DD",
  hour: 'YYYY-MM-DD"T"HH24',
};

// Month and weekday names spelled out, since en-GB and en-NG now write September "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthName(date: CalendarDay): string {
  return MONTHS[date.month - 1] ?? "";
}

function weekdayName(date: CalendarDay): string {
  return WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] ?? "";
}

/* ── A sales period ─────────────────────────────────────────────────────── */

export interface SalesPeriod {
  period: OverviewPeriod;
  days: number;
  /** Today is charted by hour; longer periods by day. */
  granularity: SalesGranularity;
  firstDay: CalendarDay;
  /** Today, in Lagos. */
  lastDay: CalendarDay;
  /** Midnight starting the first day. */
  start: Date;
  /** Midnight ending today (exclusive). */
  end: Date;
  /** The comparison window: the same length of time just before `start`, up to the same moment as now. */
  previousStart: Date;
  previousEnd: Date;
}

/** The current and comparison windows for a period, as of `now`. */
export function salesPeriod(period: OverviewPeriod, now: Date): SalesPeriod {
  const { days } = overviewPeriodOption(period);
  const lastDay = lagosCalendarDay(now);
  const firstDay = addCalendarDays(lastDay, -(days - 1));
  const start = startOfLagosDay(firstDay);
  const end = startOfLagosDay(addCalendarDays(lastDay, 1));
  const previousStart = startOfLagosDay(addCalendarDays(firstDay, -days));
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), end.getTime() - start.getTime());

  return {
    period,
    days,
    granularity: period === "today" ? "hour" : "day",
    firstDay,
    lastDay,
    start,
    end,
    previousStart,
    previousEnd: new Date(Math.min(previousStart.getTime() + elapsed, start.getTime())),
  };
}

/** The dates a period covers: "16 Sep 2026", "10–16 Sep 2026", "18 Aug – 16 Sep 2026", "3 Dec 2025 – 1 Jan 2026". */
export function describePeriodDates(period: Pick<SalesPeriod, "firstDay" | "lastDay">): string {
  const { firstDay: from, lastDay: to } = period;
  const toText = `${to.day} ${monthName(to)} ${to.year}`;
  if (calendarDayKey(from) === calendarDayKey(to)) return toText;
  if (from.year === to.year && from.month === to.month) return `${from.day}–${toText}`;
  if (from.year === to.year) return `${from.day} ${monthName(from)} – ${toText}`;
  return `${from.day} ${monthName(from)} ${from.year} – ${toText}`;
}

export interface SalesBucket {
  /** Matches lagosBucketKey / SALES_BUCKET_SQL_FORMAT. */
  key: string;
  start: Date;
  /** For tooltips and the table: "Wed 16 Sep" or "14:00–15:00". */
  label: string;
  /** For the axis: "16 Sep" or "14:00". */
  tickLabel: string;
}

/** One bucket per Lagos day of the period (or per hour of today), oldest first. */
export function salesBuckets(period: SalesPeriod): SalesBucket[] {
  if (period.granularity === "hour") {
    // Hours step from midnight in fixed 60-minute strides: right for Lagos, which never changes its clocks.
    const dayKey = calendarDayKey(period.lastDay);
    return Array.from({ length: 24 }, (_, hour) => ({
      key: `${dayKey}T${pad(hour)}`,
      start: new Date(period.start.getTime() + hour * HOUR_MS),
      label: `${pad(hour)}:00–${pad((hour + 1) % 24)}:00`,
      tickLabel: `${pad(hour)}:00`,
    }));
  }

  return Array.from({ length: period.days }, (_, index) => {
    const day = addCalendarDays(period.firstDay, index);
    return {
      key: calendarDayKey(day),
      start: startOfLagosDay(day),
      label: `${weekdayName(day)} ${day.day} ${monthName(day)}`,
      tickLabel: `${day.day} ${monthName(day)}`,
    };
  });
}

/* ── Summaries and comparisons ──────────────────────────────────────────── */

export interface SalesTotals {
  /** Paid orders. */
  orders: number;
  /** Kobo, after processed refunds. */
  revenue: number;
  /** Pieces in those orders. */
  units: number;
}

/** One grouped row from the sales query. `bucket` is set for the current window only. */
export interface SalesAggregateRow {
  current: boolean;
  isTest: boolean;
  bucket: string | null;
  orders: number;
  revenue: number;
  units: number;
}

export interface SalesPoint {
  key: string;
  label: string;
  tickLabel: string;
  revenue: number;
  orders: number;
}

export interface SalesSummary {
  current: SalesTotals;
  previous: SalesTotals;
  /** One point per bucket, zeros included. */
  series: SalesPoint[];
  /** The other mode's figures for the current window (test sales while showing real ones, and the reverse). */
  otherMode: SalesTotals;
}

function emptyTotals(): SalesTotals {
  return { orders: 0, revenue: 0, units: 0 };
}

function addTo(totals: SalesTotals, row: SalesAggregateRow) {
  totals.orders += row.orders;
  totals.revenue += row.revenue;
  totals.units += row.units;
}

/** Folds the grouped rows into the figures for one mode, filling empty buckets with zeros. */
export function summariseSales(
  rows: readonly SalesAggregateRow[],
  buckets: readonly SalesBucket[],
  mode: SalesMode,
): SalesSummary {
  const current = emptyTotals();
  const previous = emptyTotals();
  const otherMode = emptyTotals();
  const byBucket = new Map<string, { revenue: number; orders: number }>();

  for (const row of rows) {
    const inMode = row.isTest === (mode === "test");
    if (!row.current) {
      if (inMode) addTo(previous, row);
      continue;
    }
    if (!inMode) {
      addTo(otherMode, row);
      continue;
    }
    addTo(current, row);
    if (row.bucket) {
      const point = byBucket.get(row.bucket) ?? { revenue: 0, orders: 0 };
      point.revenue += row.revenue;
      point.orders += row.orders;
      byBucket.set(row.bucket, point);
    }
  }

  const series = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    tickLabel: bucket.tickLabel,
    revenue: byBucket.get(bucket.key)?.revenue ?? 0,
    orders: byBucket.get(bucket.key)?.orders ?? 0,
  }));

  return { current, previous, series, otherMode };
}

/** Revenue per paid order, in whole kobo; null when there were no orders. */
export function averageOrderValue(totals: Pick<SalesTotals, "orders" | "revenue">): number | null {
  return totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : null;
}

export interface Change {
  direction: "up" | "down" | "flat";
  /** Whole percent, never negative (the direction says which way). */
  percent: number;
  /** The two figures were exactly equal. */
  same: boolean;
}

/**
 * How a figure moved against the comparison window. Null when the comparison has
 * nothing to measure against (previous is 0 or missing): no invented percentages.
 */
export function compareFigures(current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (percent === 0) return { direction: "flat", percent: 0, same: current === previous };
  return { direction: current > previous ? "up" : "down", percent, same: false };
}

const percentFormat = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

/** "12% vs the 7 days before", "Same as yesterday by this time", "About the same as the 30 days before". */
export function describeChange(change: Change, comparison: string): string {
  if (change.direction === "flat") return change.same ? `Same as ${comparison}` : `About the same as ${comparison}`;
  return `${percentFormat.format(change.percent)}% vs ${comparison}`;
}

/* ── The chart's axis ───────────────────────────────────────────────────── */

export interface ChartScale {
  /** The top of the axis, in kobo (a tick). */
  max: number;
  /** Gridline values in kobo, from 0 up to max. */
  ticks: number[];
}

/**
 * A money axis with round steps (1, 2, 2.5 or 5 × a power of ten naira) that clears
 * `largest`: three or four gridlines counting the baseline.
 */
export function revenueScale(largest: number): ChartScale {
  const target = Math.max(largest, 0) / 3;
  let step = 100; // ₦1
  if (target > step) {
    const magnitude = 10 ** Math.floor(Math.log10(target));
    step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= target) ?? 10 * magnitude;
    step = Math.max(100, Math.round(step));
  }
  const count = Math.max(1, Math.ceil(Math.max(largest, 0) / step));
  const ticks = Array.from({ length: count + 1 }, (_, index) => index * step);
  return { max: count * step, ticks };
}

function trimDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** Short axis money: "₦0", "₦500", "₦2.5k", "₦50k", "₦1.5m". Round figures only (axis ticks). */
export function formatCompactNaira(kobo: number): string {
  const naira = Math.round(kobo) / 100;
  if (naira >= 1_000_000) return `₦${trimDecimal(naira / 1_000_000)}m`;
  if (naira >= 1_000) return `₦${trimDecimal(naira / 1_000)}k`;
  return `₦${trimDecimal(naira)}`;
}

export interface AxisLabel {
  /** Index of the bucket the label sits under. */
  index: number;
  /** Shown from the small breakpoint up only, so phones get half as many labels. */
  minor: boolean;
}

/**
 * Which buckets get a label on the chart's x axis. Hours: 00:00, 06:00, 12:00 and
 * 18:00. Days: every day up to a week; otherwise about six, counted back from
 * today so the latest day is always labelled. Every other label is `minor`.
 */
export function chartAxisLabels(count: number, granularity: SalesGranularity): AxisLabel[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];
  if (granularity === "hour") {
    return [0, 6, 12, 18].filter((index) => index < total).map((index) => ({ index, minor: false }));
  }

  const step = total <= 7 ? 1 : Math.ceil(total / 6);
  const labels: AxisLabel[] = [];
  for (let offset = 0, nth = 0; offset < total; offset += step, nth++) {
    labels.push({ index: total - 1 - offset, minor: nth % 2 === 1 });
  }
  return labels.reverse();
}

/** The bucket with the most revenue (the earliest, on a tie); null when nothing sold. */
export function peakPoint<T extends Pick<SalesPoint, "revenue">>(series: readonly T[]): T | null {
  let peak: T | null = null;
  for (const point of series) {
    if (point.revenue > 0 && (peak === null || point.revenue > peak.revenue)) peak = point;
  }
  return peak;
}

/* ── Queries ────────────────────────────────────────────────────────────── */

/**
 * A section's figures, or why there are none: the database isn't set up
 * (DATABASE_URL missing) or the query failed (logged on the server).
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: "not_configured" | "failed" };

async function database() {
  const { getDb, isDatabaseConfigured } = await import("@/lib/db");
  return isDatabaseConfigured() ? getDb() : null;
}

async function load<T>(key: string, run: (db: NonNullable<Awaited<ReturnType<typeof database>>>) => Promise<T>): Promise<Loaded<T>> {
  try {
    const db = await database();
    if (!db) return { ok: false, reason: "not_configured" };
    return { ok: true, data: await run(db) };
  } catch (error) {
    console.error(`[admin] overview ${key} failed:`, error instanceof Error ? error.message : error);
    return { ok: false, reason: "failed" };
  }
}

/** Counts and sums from raw SQL arrive as number, bigint or string depending on the type. */
function toNumber(value: unknown): number {
  const number = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/** A text[] column (array_agg), which is null when nothing matched. */
function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** A timestamp parameter for the TIMESTAMP(3) columns, which hold UTC. */
function utc(date: Date): string {
  return date.toISOString();
}

export interface SalesOverview extends SalesSummary {
  mode: SalesMode;
}

/**
 * Sales for a period and mode, with the comparison window and the chart series:
 * one grouped query over both windows and both modes.
 */
export async function getSalesOverview(period: SalesPeriod, mode: SalesMode): Promise<Loaded<SalesOverview>> {
  return load("sales", async (db) => {
    const rows = await db.$queryRaw<
      { current: boolean; isTest: boolean; bucket: string | null; orders: unknown; revenue: unknown; units: unknown }[]
    >`
      WITH sales AS (
        SELECT
          o."paidAt",
          o."paidAt" >= (${utc(period.start)}::timestamptz AT TIME ZONE 'UTC') AS "current",
          o."total" - LEAST(
            o."total",
            COALESCE((SELECT SUM(r."amount") FROM "Refund" r WHERE r."orderId" = o."id" AND r."status" = 'PROCESSED'), 0)
          ) AS "net",
          COALESCE((SELECT SUM(i."quantity") FROM "OrderItem" i WHERE i."orderId" = o."id"), 0) AS "units",
          COALESCE(
            (SELECT bool_and(p."isTest") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" IN ('SUCCESS', 'REFUNDED')),
            false
          ) AS "isTest"
        FROM "Order" o
        WHERE o."isDemo" = false
          AND o."status" IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED')
          AND o."paidAt" IS NOT NULL
          AND (
            (o."paidAt" >= (${utc(period.start)}::timestamptz AT TIME ZONE 'UTC')
              AND o."paidAt" < (${utc(period.end)}::timestamptz AT TIME ZONE 'UTC'))
            OR (o."paidAt" >= (${utc(period.previousStart)}::timestamptz AT TIME ZONE 'UTC')
              AND o."paidAt" < (${utc(period.previousEnd)}::timestamptz AT TIME ZONE 'UTC'))
          )
      )
      SELECT
        s."current",
        s."isTest",
        CASE WHEN s."current" THEN
          to_char((s."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${ADMIN_TIME_ZONE}::text, ${SALES_BUCKET_SQL_FORMAT[period.granularity]}::text)
        END AS "bucket",
        COUNT(*)::int AS "orders",
        COALESCE(SUM(s."net"), 0)::bigint AS "revenue",
        COALESCE(SUM(s."units"), 0)::bigint AS "units"
      FROM sales s
      GROUP BY 1, 2, 3`;

    const summary = summariseSales(
      rows.map((row) => ({
        current: Boolean(row.current),
        isTest: Boolean(row.isTest),
        bucket: row.bucket ?? null,
        orders: toNumber(row.orders),
        revenue: toNumber(row.revenue),
        units: toNumber(row.units),
      })),
      salesBuckets(period),
      mode,
    );
    return { ...summary, mode };
  });
}

export interface WorkQueue {
  /** Paid, not yet packed (PAID). */
  toPrepare: number;
  /** Packed, waiting for the courier (PROCESSING). */
  readyToShip: number;
  /** Unpaid checkouts whose hold on the pieces hasn't ended. */
  awaitingPayment: number;
  /** Cancelled although the customer paid, with no processed refund yet. */
  refundsDue: number;
  /** Up to five of those, most recently cancelled first, to link straight to. */
  refundsDueNumbers: string[];
  /** Of those, how many already have a refund in progress with Paystack. */
  refundsInProgress: number;
  /** Orders going ahead that were paid more than once; the extra payment must be refunded. */
  paidTwice: number;
  /** Up to five of those, newest first, to link straight to. */
  paidTwiceNumbers: string[];
  reviewsPending: number;
}

/**
 * Everything waiting on the owner right now (not tied to the period), in one query.
 * Counts every order, demo and test-mode ones included, so they agree with the
 * orders list and the navigation badge.
 */
export async function getWorkQueue(now: Date): Promise<Loaded<WorkQueue>> {
  return load("work queue", async (db) => {
    const [row] = await db.$queryRaw<
      {
        toPrepare: unknown;
        readyToShip: unknown;
        awaitingPayment: unknown;
        refundsDue: unknown;
        refundsDueNumbers: string[] | null;
        refundsInProgress: unknown;
        reviewsPending: unknown;
        paidTwice: unknown;
        paidTwiceNumbers: string[] | null;
      }[]
    >`
      WITH due AS (
        SELECT o."id", o."number", COALESCE(o."cancelledAt", o."updatedAt") AS "since"
        FROM "Order" o
        WHERE o."status" = 'CANCELLED'
          AND o."paymentStatus" = 'SUCCESS'
          AND NOT EXISTS (SELECT 1 FROM "Refund" r WHERE r."orderId" = o."id" AND r."status" = 'PROCESSED')
      ),
      twice AS (
        SELECT o."number", MAX(p."paidAt") AS "lastPaidAt"
        FROM "Payment" p
        JOIN "Order" o ON o."id" = p."orderId"
        WHERE p."status" = 'SUCCESS'
          AND o."status" IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED')
          AND NOT EXISTS (SELECT 1 FROM "Refund" r WHERE r."paymentId" = p."id" AND r."status" = 'PROCESSED')
        GROUP BY o."id", o."number"
        HAVING COUNT(*) > 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM "Order" WHERE "status" = 'PAID') AS "toPrepare",
        (SELECT COUNT(*)::int FROM "Order" WHERE "status" = 'PROCESSING') AS "readyToShip",
        (SELECT COUNT(*)::int FROM "Order"
          WHERE "status" = 'PENDING'
            AND "paymentStatus" <> 'SUCCESS'
            AND ("reservedUntil" IS NULL OR "reservedUntil" > (${utc(now)}::timestamptz AT TIME ZONE 'UTC'))) AS "awaitingPayment",
        (SELECT COUNT(*)::int FROM due) AS "refundsDue",
        (SELECT array_agg(d."number" ORDER BY d."since" DESC)
          FROM (SELECT * FROM due ORDER BY "since" DESC LIMIT 5) d) AS "refundsDueNumbers",
        (SELECT COUNT(*)::int FROM due
          WHERE EXISTS (SELECT 1 FROM "Refund" r WHERE r."orderId" = due."id" AND r."status" = 'PENDING')) AS "refundsInProgress",
        (SELECT COUNT(*)::int FROM "Review" WHERE "status" = 'PENDING') AS "reviewsPending",
        (SELECT COUNT(*)::int FROM twice) AS "paidTwice",
        (SELECT array_agg(t."number" ORDER BY t."lastPaidAt" DESC NULLS LAST)
          FROM (SELECT * FROM twice ORDER BY "lastPaidAt" DESC NULLS LAST LIMIT 5) t) AS "paidTwiceNumbers"`;

    return {
      toPrepare: toNumber(row?.toPrepare),
      readyToShip: toNumber(row?.readyToShip),
      awaitingPayment: toNumber(row?.awaitingPayment),
      refundsDue: toNumber(row?.refundsDue),
      refundsDueNumbers: textList(row?.refundsDueNumbers),
      refundsInProgress: toNumber(row?.refundsInProgress),
      reviewsPending: toNumber(row?.reviewsPending),
      paidTwice: toNumber(row?.paidTwice),
      paidTwiceNumbers: textList(row?.paidTwiceNumbers),
    };
  });
}

export interface StockWatchItem {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  onHand: number;
  reserved: number;
  /** In stock minus held for unpaid checkouts (never below 0). */
  available: number;
  lowStockThreshold: number;
}

export interface StockWatch {
  /** Active variants of live products. */
  liveVariants: number;
  /** Available, but at or below its low-stock level. */
  lowStock: number;
  /** Nothing available (no stock record counts as none, as in the store). */
  outOfStock: number;
  /** The lowest of those, up to `limit`: fewest available first. */
  lowest: StockWatchItem[];
}

/** Sold-out and low-stock pieces among live products, by the storefront's rule, in one query. */
export async function getStockWatch(limit = 5): Promise<Loaded<StockWatch>> {
  const take = Math.min(Math.max(Math.floor(limit), 1), 20);
  const defaultThreshold = siteConfig.commerce.defaultLowStockThreshold;

  return load("stock", async (db) => {
    const rows = await db.$queryRaw<
      {
        liveVariants: unknown;
        lowStock: unknown;
        outOfStock: unknown;
        variantId: string | null;
        sku: string | null;
        productId: string | null;
        productName: string | null;
        colorName: string | null;
        sizeLabel: string | null;
        onHand: unknown;
        reserved: unknown;
        available: unknown;
        lowStockThreshold: unknown;
      }[]
    >`
      WITH levels AS (
        SELECT
          v."id" AS "variantId",
          v."sku",
          p."id" AS "productId",
          p."name" AS "productName",
          c."name" AS "colorName",
          s."label" AS "sizeLabel",
          COALESCE(i."onHand", 0) AS "onHand",
          COALESCE(i."reserved", 0) AS "reserved",
          GREATEST(COALESCE(i."onHand", 0) - COALESCE(i."reserved", 0), 0) AS "available",
          COALESCE(i."lowStockThreshold", ${defaultThreshold}::int) AS "lowStockThreshold"
        FROM "ProductVariant" v
        JOIN "Product" p ON p."id" = v."productId"
        JOIN "Color" c ON c."id" = v."colorId"
        JOIN "Size" s ON s."id" = v."sizeId"
        LEFT JOIN "Inventory" i ON i."variantId" = v."id"
        WHERE p."status" = 'ACTIVE' AND v."isActive" = true
      ),
      counts AS (
        SELECT
          COUNT(*)::int AS "liveVariants",
          (COUNT(*) FILTER (WHERE "available" > 0 AND "available" <= "lowStockThreshold"))::int AS "lowStock",
          (COUNT(*) FILTER (WHERE "available" = 0))::int AS "outOfStock"
        FROM levels
      )
      SELECT counts.*, lowest.*
      FROM counts
      LEFT JOIN LATERAL (
        SELECT * FROM levels
        WHERE "available" <= "lowStockThreshold"
        ORDER BY "available" ASC, "productName" ASC, "sku" ASC
        LIMIT ${take}::int
      ) lowest ON true`;

    const first = rows[0];
    return {
      liveVariants: toNumber(first?.liveVariants),
      lowStock: toNumber(first?.lowStock),
      outOfStock: toNumber(first?.outOfStock),
      lowest: rows.flatMap((row) =>
        row.variantId && row.sku && row.productId
          ? [
              {
                variantId: row.variantId,
                sku: row.sku,
                productId: row.productId,
                productName: row.productName ?? "",
                colorName: row.colorName ?? "",
                sizeLabel: row.sizeLabel ?? "",
                onHand: toNumber(row.onHand),
                reserved: toNumber(row.reserved),
                available: toNumber(row.available),
                lowStockThreshold: toNumber(row.lowStockThreshold),
              },
            ]
          : [],
      ),
    };
  });
}

export interface RecentOrder {
  id: string;
  number: string;
  customerName: string;
  email: string;
  /** Kobo. */
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  reservedUntil: Date | null;
  createdAt: Date;
  isDemo: boolean;
  /** Paid only with Paystack test keys: no real money moved. */
  isTest: boolean;
}

/**
 * The newest orders, whatever their status, leaving out checkouts that closed
 * without payment (cancelled and never paid): those are noise here, and the orders
 * list still has them.
 */
export async function getRecentOrders(limit = 8): Promise<Loaded<RecentOrder[]>> {
  const take = Math.min(Math.max(Math.floor(limit), 1), 25);

  return load("recent orders", async (db) => {
    const orders = await db.order.findMany({
      where: { OR: [{ status: { not: "CANCELLED" } }, { paymentStatus: "SUCCESS" }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        number: true,
        customerName: true,
        email: true,
        total: true,
        status: true,
        paymentStatus: true,
        reservedUntil: true,
        createdAt: true,
        isDemo: true,
        payments: { where: { status: { in: ["SUCCESS", "REFUNDED"] } }, select: { isTest: true } },
      },
    });

    return orders.map(({ payments, ...order }) => ({
      ...order,
      isTest: payments.length > 0 && payments.every((payment) => payment.isTest),
    }));
  });
}
