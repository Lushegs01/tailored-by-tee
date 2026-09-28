import type { DeliveryMethod, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { parseListParams, type ListParams, type RawSearchParams } from "@/lib/admin/pagination";
import {
  ORDER_STATUS_OPTIONS,
  ORDER_STATUSES_TO_FULFIL,
  PAYMENT_STATUS_OPTIONS,
} from "@/lib/admin/status";
import { normalizeNigerianPhone } from "@/lib/commerce/phone";

/*
 * The orders list's URL: /admin/orders?q=ada&status=PAID&sort=total&dir=asc&page=2
 *
 * Pure (no database, no server-only), so the page, the CSV export and the tests
 * read the same rules. Everything here treats the URL as untrusted: unknown
 * values fall back to the default and nothing throws.
 *
 * Test and demo orders are shown by default. They are real rows in the same
 * table, they're labelled in the list, and the navigation badge and the overview
 * count them — hiding them here would make those figures disagree, and would make
 * a store still being set up look empty. The "Show" filter hides or isolates them.
 */

/** The status filter's extra value: paid and not yet shipped, the owner's work queue. */
export const TO_FULFIL = "to_fulfil";

/** Values of the ?show= filter. */
export const SHOW_VALUES = ["hide_test", "only_test", "hide_demo", "only_demo"] as const;
export type ShowFilter = (typeof SHOW_VALUES)[number];

/** Values of the ?placed= filter, each a number of Lagos calendar days ending today. */
export const RANGE_DAYS: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export const RANGE_VALUES = ["today", "7d", "30d", "90d"] as const;
export type RangeFilter = (typeof RANGE_VALUES)[number];

export const ORDER_SORTS = ["placed", "total"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

const STATUS_VALUES = ORDER_STATUS_OPTIONS.map((option) => option.value);
const PAYMENT_VALUES = PAYMENT_STATUS_OPTIONS.map((option) => option.value);
const METHOD_VALUES: readonly DeliveryMethod[] = ["DELIVERY", "PICKUP"];

/* ── The filter selects ─────────────────────────────────────────────────── */

export const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: TO_FULFIL, label: "To fulfil (paid, not yet shipped)" },
  ...ORDER_STATUS_OPTIONS,
];

export const PAYMENT_FILTER_OPTIONS = PAYMENT_STATUS_OPTIONS;

export const METHOD_FILTER_OPTIONS: readonly { value: DeliveryMethod; label: string }[] = [
  { value: "DELIVERY", label: "Delivery" },
  { value: "PICKUP", label: "Collection" },
];

export const RANGE_FILTER_OPTIONS: readonly { value: RangeFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

export const SHOW_FILTER_OPTIONS: readonly { value: ShowFilter; label: string }[] = [
  { value: "hide_test", label: "Hide test payments" },
  { value: "only_test", label: "Test payments only" },
  { value: "hide_demo", label: "Hide demo orders" },
  { value: "only_demo", label: "Demo orders only" },
];

/* ── Parsing ────────────────────────────────────────────────────────────── */

export const ORDER_LIST_ALLOWED = {
  sort: ORDER_SORTS,
  filters: ["status", "payment", "method", "placed", "show"],
  defaultSort: "placed",
  defaultDir: "desc",
  filterValues: {
    status: [TO_FULFIL, ...STATUS_VALUES],
    payment: PAYMENT_VALUES,
    method: METHOD_VALUES,
    placed: RANGE_VALUES,
    show: SHOW_VALUES,
  },
} as const;

/** Reads the list URL. Never throws; unknown values are simply left out. */
export function parseOrderListParams(searchParams: RawSearchParams | URLSearchParams): ListParams {
  return parseListParams(searchParams, ORDER_LIST_ALLOWED);
}

/** True when the owner has narrowed the list, so an empty result can say "nothing matches". */
export function hasOrderFilters(params: ListParams): boolean {
  return params.q !== "" || Object.keys(params.filters).length > 0;
}

/* ── Search ─────────────────────────────────────────────────────────────── */

/**
 * Makes a person's search safe to use as a LIKE/ILIKE pattern. Postgres treats
 * backslash as LIKE's escape character by default, so escaping `\`, `%` and `_`
 * makes each of them match itself — without this, a search for "a_b" would also
 * find "axb", and a lone "%" would match every order.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export interface OrderSearch {
  /** The escaped text to match against numbers, names and emails. */
  text: string;
  /** The same search read as a Nigerian mobile number (+234…), when it is one. */
  phone: string | null;
}

/**
 * What to search for. A phone number typed any of the usual ways ("0803 123
 * 4567", "+234 803…") is also matched against the stored +234 form, since that is
 * what checkout saves.
 */
export function orderSearch(q: string): OrderSearch | null {
  const text = q.trim();
  if (text === "") return null;
  return { text: escapeLikePattern(text), phone: normalizeNigerianPhone(text) };
}

/* ── Lagos days ─────────────────────────────────────────────────────────── */

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** West Africa Time is UTC+1 all year — Nigeria has never used daylight saving. */
const LAGOS_OFFSET_MS = HOUR_MS;

/** Midnight in Lagos at the start of the day `value` falls in. */
export function startOfLagosDay(value: Date): Date {
  const shifted = value.getTime() + LAGOS_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - LAGOS_OFFSET_MS);
}

/**
 * The earliest moment a "Placed" filter covers: `days` Lagos calendar days ending
 * with today, so "Last 7 days" means today and the six days before it.
 */
export function rangeStart(range: string, now: Date): Date | null {
  const days = RANGE_DAYS[range];
  if (!days) return null;
  return new Date(startOfLagosDay(now).getTime() - (days - 1) * DAY_MS);
}

/* ── The query the server runs ──────────────────────────────────────────── */

export interface OrderListQuery {
  search: OrderSearch | null;
  /** The statuses to include; empty means every status. */
  statuses: readonly OrderStatus[];
  paymentStatus: PaymentStatus | null;
  deliveryMethod: DeliveryMethod | null;
  placedFrom: Date | null;
  isTest: boolean | null;
  isDemo: boolean | null;
  sort: OrderSort;
  dir: "asc" | "desc";
  page: number;
}

function asStatus(value: string | undefined): OrderStatus | null {
  return value && (STATUS_VALUES as readonly string[]).includes(value) ? (value as OrderStatus) : null;
}

/** Turns the parsed URL into exactly what the database is asked for. */
export function toOrderListQuery(params: ListParams, now: Date = new Date()): OrderListQuery {
  const statusFilter = params.filters.status;
  const statuses =
    statusFilter === TO_FULFIL
      ? ORDER_STATUSES_TO_FULFIL
      : (() => {
          const status = asStatus(statusFilter);
          return status ? [status] : [];
        })();

  const payment = params.filters.payment;
  const method = params.filters.method;
  const show = params.filters.show;

  return {
    search: orderSearch(params.q),
    statuses,
    paymentStatus: payment && (PAYMENT_VALUES as readonly string[]).includes(payment) ? (payment as PaymentStatus) : null,
    deliveryMethod: method && (METHOD_VALUES as readonly string[]).includes(method) ? (method as DeliveryMethod) : null,
    placedFrom: rangeStart(params.filters.placed ?? "", now),
    isTest: show === "hide_test" ? false : show === "only_test" ? true : null,
    isDemo: show === "hide_demo" ? false : show === "only_demo" ? true : null,
    sort: (ORDER_SORTS as readonly string[]).includes(params.sort) ? (params.sort as OrderSort) : "placed",
    dir: params.dir,
    page: params.page,
  };
}

/** A short sentence naming what the list is currently showing, for the CSV file and the page. */
export function describeOrderFilters(params: ListParams): string {
  const parts: string[] = [];
  const status = params.filters.status;
  if (status === TO_FULFIL) parts.push("to fulfil");
  else {
    const label = ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label;
    if (label) parts.push(label.toLowerCase());
  }
  const payment = PAYMENT_FILTER_OPTIONS.find((option) => option.value === params.filters.payment)?.label;
  if (payment) parts.push(`payment ${payment.toLowerCase()}`);
  const method = METHOD_FILTER_OPTIONS.find((option) => option.value === params.filters.method)?.label;
  if (method) parts.push(method.toLowerCase());
  const placed = RANGE_FILTER_OPTIONS.find((option) => option.value === params.filters.placed)?.label;
  if (placed) parts.push(placed.toLowerCase());
  const show = SHOW_FILTER_OPTIONS.find((option) => option.value === params.filters.show)?.label;
  if (show) parts.push(show.toLowerCase());
  if (params.q) parts.push(`matching “${params.q}”`);
  return parts.length > 0 ? parts.join(", ") : "all orders";
}
