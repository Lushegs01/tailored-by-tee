/*
 * The demo store: fictional customers, orders and reviews used to try the admin
 * area before real trading starts (`npm run db:seed:demo`).
 *
 * Pure — no database, no environment, no server-only imports — so every rule here
 * is covered by demo-fixtures.test.ts and the scripts stay thin. The scripts in
 * `scripts/` turn these plans into rows against the shop's real catalogue.
 *
 * Everything this file describes is marked in the database (`User.isDemo`,
 * `Order.isDemo`, `Payment.isTest`, `Review.isDemo`) and is addressed on the
 * reserved `example.com` domain, so `npm run db:clear-demo` can take all of it
 * out again and nothing here can ever be mistaken for a real sale.
 */
import { siteConfig } from "@/config/site";
import type { Kobo } from "@/lib/catalog/types";
import { quoteDelivery, type DeliveryMethod, type DeliveryQuote } from "@/lib/commerce/delivery";
import { computeTotals, type OrderTotals } from "@/lib/commerce/totals";

/* ── Marks and names ────────────────────────────────────────────────────── */

/** Reserved for documentation and examples (RFC 2606): no demo mail can ever be delivered. */
export const DEMO_EMAIL_DOMAIN = "example.com";

/** Demo orders are numbered apart from the shop's own ORD- counter, which they never touch. */
export const DEMO_ORDER_PREFIX = "DEMO";

export const DEMO_ORDER_NUMBER_PATTERN = /^DEMO-\d{4}-\d{6}$/;

/** "DEMO-2026-000001". */
export function demoOrderNumber(year: number, sequence: number): string {
  return `${DEMO_ORDER_PREFIX}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function isDemoOrderNumber(value: string): boolean {
  return DEMO_ORDER_NUMBER_PATTERN.test(value);
}

export function demoEmail(key: string): string {
  return `demo.${key}@${DEMO_EMAIL_DOMAIN}`;
}

export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/*
 * Stable row ids, so a re-seed writes the same records rather than a second set,
 * and so anything demo is recognisable in the database by eye.
 */
const seq = (sequence: number) => String(sequence).padStart(6, "0");

export function demoUserId(key: string): string {
  return `demo_user_${key}`;
}
export function demoAddressId(key: string): string {
  return `demo_addr_${key}`;
}
export function demoOrderId(year: number, sequence: number): string {
  return `demo_order_${year}_${seq(sequence)}`;
}
export function demoOrderItemId(year: number, sequence: number, index: number): string {
  return `demo_item_${year}_${seq(sequence)}_${index + 1}`;
}
export function demoOrderEventId(year: number, sequence: number, index: number): string {
  return `demo_event_${year}_${seq(sequence)}_${index + 1}`;
}
export function demoPaymentId(year: number, sequence: number, attempt: number): string {
  return `demo_pay_${year}_${seq(sequence)}_${attempt}`;
}
export function demoRefundId(year: number, sequence: number): string {
  return `demo_refund_${year}_${seq(sequence)}`;
}
export function demoCouponUsageId(year: number, sequence: number): string {
  return `demo_use_${year}_${seq(sequence)}`;
}
export function demoReviewId(key: string): string {
  return `demo_review_${key}`;
}

/** Paystack references are unique per attempt; "DEMO-" marks them as ours, never a real charge. */
export function demoPaymentReference(orderNumber: string, attempt: number): string {
  return `${orderNumber}-P${attempt}`;
}

/** Obviously fictional couriers — no real company is named in demo data. */
export const DEMO_CARRIERS = ["Demo Couriers", "Example Logistics", "Sample Dispatch"] as const;

export function demoTrackingNumber(year: number, sequence: number): string {
  return `DEMO-TRK-${year}-${seq(sequence)}`;
}

/* ── Lagos time ─────────────────────────────────────────────────────────── */

/** West Africa Time is UTC+1 all year — no summer time, so day arithmetic is exact. */
export const LAGOS_OFFSET_MINUTES = 60;

const DAY_MS = 86_400_000;
const LAGOS_OFFSET_MS = LAGOS_OFFSET_MINUTES * 60_000;

/** The instant at which Lagos clocks read this wall-clock time. */
export function lagosInstant(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - LAGOS_OFFSET_MS);
}

/** The Lagos calendar date an instant falls on. */
export function lagosCalendarParts(at: Date): { year: number; month: number; day: number } {
  const shifted = new Date(at.getTime() + LAGOS_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** `daysAgo` Lagos days before `now`, at the given Lagos wall-clock time. */
export function lagosDaysAgo(now: Date, daysAgo: number, hour: number, minute: number): Date {
  const today = lagosCalendarParts(now);
  return new Date(lagosInstant(today.year, today.month, today.day, hour, minute).getTime() - daysAgo * DAY_MS);
}

/* ── Customers ──────────────────────────────────────────────────────────── */

export interface DemoAddress {
  line1: string;
  line2: string | null;
  city: string;
  /** Nigerian state code (see src/config/nigeria.ts). */
  state: string;
  postalCode: string | null;
}

export interface DemoCustomer {
  /** Short key; also the local part of the email and the suffix of the row ids. */
  key: string;
  name: string;
  /** E.164, and deliberately in an unassigned 0000 block. */
  phone: string;
  /** True for a customer with an account; false for a guest checkout (the order carries the details). */
  registered: boolean;
  address: DemoAddress;
}

/**
 * Eight fictional customers across the three delivery zones, half of them with
 * accounts. Street names say "example" or "sample" out loud, so no real address
 * is ever printed on a packing slip by mistake.
 */
export const DEMO_CUSTOMERS: readonly DemoCustomer[] = [
  {
    key: "adaeze",
    name: "Adaeze Okonkwo",
    phone: "+2348030000101",
    registered: true,
    address: { line1: "12 Example Close", line2: "Flat 3", city: "Lekki", state: "LA", postalCode: "106104" },
  },
  {
    key: "tunde",
    name: "Tunde Bakare",
    phone: "+2347010000102",
    registered: true,
    address: { line1: "7 Sample Avenue", line2: null, city: "Ikeja", state: "LA", postalCode: "100271" },
  },
  {
    key: "chiamaka",
    name: "Chiamaka Eze",
    phone: "+2349010000103",
    registered: true,
    address: { line1: "24 Specimen Road", line2: "Block B", city: "Yaba", state: "LA", postalCode: null },
  },
  {
    key: "ibrahim",
    name: "Ibrahim Yusuf",
    phone: "+2348110000104",
    registered: true,
    address: { line1: "3 Example Crescent", line2: null, city: "Abeokuta", state: "OG", postalCode: null },
  },
  {
    key: "folake",
    name: "Folake Adeyemi",
    phone: "+2347080000105",
    registered: false,
    address: { line1: "58 Sample Street", line2: null, city: "Ibadan", state: "OY", postalCode: null },
  },
  {
    key: "emeka",
    name: "Emeka Nwosu",
    phone: "+2348160000106",
    registered: false,
    address: { line1: "9 Placeholder Drive", line2: "Suite 2", city: "Port Harcourt", state: "RI", postalCode: null },
  },
  {
    key: "halima",
    name: "Halima Bello",
    phone: "+2349060000107",
    registered: false,
    address: { line1: "41 Example Way", line2: null, city: "Abuja", state: "FC", postalCode: "900108" },
  },
  {
    key: "seyi",
    name: "Seyi Ogundipe",
    phone: "+2348090000108",
    registered: false,
    address: { line1: "16 Sample Lane", line2: null, city: "Kano", state: "KN", postalCode: null },
  },
];

const CUSTOMERS_BY_KEY = new Map(DEMO_CUSTOMERS.map((customer) => [customer.key, customer]));

export function demoCustomer(key: string): DemoCustomer {
  const customer = CUSTOMERS_BY_KEY.get(key);
  if (!customer) throw new RangeError(`Unknown demo customer "${key}"`);
  return customer;
}

/* ── Orders ─────────────────────────────────────────────────────────────── */

export type DemoOrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type DemoPaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "ABANDONED" | "REFUNDED";
export type DemoRefundStatus = "PENDING" | "PROCESSED" | "FAILED";

export interface DemoRefundSpec {
  status: DemoRefundStatus;
  /** A partial refund returns roughly one line rather than the whole order. */
  partial: boolean;
  reason: string;
}

export interface DemoOrderSpec {
  /** 1-based; fixes the order number, the row ids and the random seed. */
  sequence: number;
  customer: string;
  status: DemoOrderStatus;
  /** Whole Lagos days before today. Ignored when `minutesAgo` is set. */
  daysAgo: number;
  /** Lagos wall-clock time the order was placed. */
  hour: number;
  minute: number;
  /** Used instead of the calendar for orders whose stock hold must be live or lapsed right now. */
  minutesAgo?: number;
  /** Distinct pieces in the bag. */
  lines: number;
  delivery: DeliveryMethod;
  /** The customer had already paid when the order was cancelled, so a refund is owed. */
  paidBeforeCancel?: boolean;
  /** A first attempt that Paystack declined, before the one that succeeded. */
  failedAttempt?: boolean;
  /** Try the shop's own discount code on this order (skipped when the shop has none). */
  withDiscount?: boolean;
  refund?: DemoRefundSpec;
}

/**
 * Thirty orders over the last sixty days, oldest first, covering every status the
 * admin has to show: work waiting today, holds that are live and holds that have
 * lapsed, a declined card, a refund owed, a refund under way and one already paid
 * back in part. Hand-written rather than generated, so the mix stays deliberate.
 */
export const DEMO_ORDER_PLAN: readonly DemoOrderSpec[] = [
  { sequence: 1, customer: "adaeze", status: "DELIVERED", daysAgo: 58, hour: 10, minute: 12, lines: 2, delivery: "delivery" },
  { sequence: 2, customer: "folake", status: "DELIVERED", daysAgo: 54, hour: 16, minute: 40, lines: 1, delivery: "delivery" },
  { sequence: 3, customer: "tunde", status: "CANCELLED", daysAgo: 51, hour: 9, minute: 5, lines: 1, delivery: "delivery" },
  { sequence: 4, customer: "chiamaka", status: "DELIVERED", daysAgo: 47, hour: 13, minute: 22, lines: 3, delivery: "pickup" },
  { sequence: 5, customer: "ibrahim", status: "REFUNDED", daysAgo: 44, hour: 11, minute: 48, lines: 2, delivery: "delivery",
    refund: { status: "PROCESSED", partial: false, reason: "Returned within the 14-day window" } },
  { sequence: 6, customer: "emeka", status: "DELIVERED", daysAgo: 41, hour: 19, minute: 3, lines: 1, delivery: "delivery" },
  { sequence: 7, customer: "adaeze", status: "DELIVERED", daysAgo: 38, hour: 8, minute: 55, lines: 2, delivery: "delivery", withDiscount: true },
  { sequence: 8, customer: "halima", status: "DELIVERED", daysAgo: 35, hour: 14, minute: 30, lines: 1, delivery: "delivery" },
  { sequence: 9, customer: "seyi", status: "CANCELLED", daysAgo: 33, hour: 21, minute: 17, lines: 2, delivery: "delivery" },
  { sequence: 10, customer: "chiamaka", status: "DELIVERED", daysAgo: 30, hour: 12, minute: 9, lines: 1, delivery: "pickup" },
  { sequence: 11, customer: "tunde", status: "REFUNDED", daysAgo: 27, hour: 10, minute: 44, lines: 3, delivery: "delivery",
    refund: { status: "PROCESSED", partial: true, reason: "One piece returned; the rest kept" } },
  { sequence: 12, customer: "folake", status: "SHIPPED", daysAgo: 24, hour: 15, minute: 2, lines: 2, delivery: "delivery" },
  { sequence: 13, customer: "adaeze", status: "SHIPPED", daysAgo: 21, hour: 9, minute: 38, lines: 1, delivery: "delivery" },
  { sequence: 14, customer: "ibrahim", status: "CANCELLED", daysAgo: 18, hour: 17, minute: 51, lines: 1, delivery: "delivery",
    paidBeforeCancel: true },
  { sequence: 15, customer: "emeka", status: "SHIPPED", daysAgo: 15, hour: 11, minute: 26, lines: 2, delivery: "delivery" },
  { sequence: 16, customer: "chiamaka", status: "PROCESSING", daysAgo: 12, hour: 13, minute: 14, lines: 1, delivery: "delivery", withDiscount: true },
  { sequence: 17, customer: "halima", status: "SHIPPED", daysAgo: 10, hour: 18, minute: 7, lines: 3, delivery: "delivery" },
  { sequence: 18, customer: "seyi", status: "PROCESSING", daysAgo: 8, hour: 10, minute: 33, lines: 1, delivery: "delivery" },
  { sequence: 19, customer: "tunde", status: "CANCELLED", daysAgo: 7, hour: 20, minute: 19, lines: 2, delivery: "delivery",
    paidBeforeCancel: true, refund: { status: "PENDING", partial: false, reason: "Customer cancelled after paying" } },
  { sequence: 20, customer: "adaeze", status: "PROCESSING", daysAgo: 6, hour: 9, minute: 41, lines: 2, delivery: "pickup" },
  { sequence: 21, customer: "folake", status: "PAID", daysAgo: 5, hour: 14, minute: 58, lines: 1, delivery: "delivery" },
  { sequence: 22, customer: "ibrahim", status: "PROCESSING", daysAgo: 4, hour: 12, minute: 25, lines: 3, delivery: "delivery" },
  { sequence: 23, customer: "emeka", status: "PAID", daysAgo: 3, hour: 16, minute: 11, lines: 2, delivery: "delivery", failedAttempt: true },
  { sequence: 24, customer: "chiamaka", status: "PAID", daysAgo: 2, hour: 10, minute: 47, lines: 1, delivery: "delivery" },
  { sequence: 25, customer: "halima", status: "PAID", daysAgo: 1, hour: 19, minute: 29, lines: 2, delivery: "delivery", withDiscount: true },
  { sequence: 26, customer: "seyi", status: "PAID", daysAgo: 1, hour: 8, minute: 15, lines: 1, delivery: "pickup" },
  { sequence: 27, customer: "adaeze", status: "PENDING", daysAgo: 0, hour: 0, minute: 0, minutesAgo: 240, lines: 2, delivery: "delivery" },
  { sequence: 28, customer: "tunde", status: "PENDING", daysAgo: 0, hour: 0, minute: 0, minutesAgo: 95, lines: 1, delivery: "delivery" },
  { sequence: 29, customer: "folake", status: "PENDING", daysAgo: 0, hour: 0, minute: 0, minutesAgo: 18, lines: 3, delivery: "delivery" },
  { sequence: 30, customer: "emeka", status: "PENDING", daysAgo: 0, hour: 0, minute: 0, minutesAgo: 6, lines: 1, delivery: "pickup" },
];

export const DEMO_ORDER_COUNT = DEMO_ORDER_PLAN.length;
export const DEMO_CUSTOMER_COUNT = DEMO_CUSTOMERS.length;

/** Statuses that mean the money arrived and the order is going ahead. */
const PAID_STATUSES: readonly DemoOrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export function demoOrderWasPaid(spec: DemoOrderSpec): boolean {
  return (
    PAID_STATUSES.includes(spec.status) || spec.status === "REFUNDED" || (spec.status === "CANCELLED" && spec.paidBeforeCancel === true)
  );
}

/** What `Order.paymentStatus` says, given the status and whether the hold has lapsed. */
export function demoPaymentStatus(spec: DemoOrderSpec, holdLapsed: boolean): DemoPaymentStatus {
  if (spec.status === "REFUNDED") return "REFUNDED";
  if (demoOrderWasPaid(spec)) return "SUCCESS";
  if (spec.status === "CANCELLED") return "ABANDONED";
  return holdLapsed ? "ABANDONED" : "PENDING";
}

/* ── Timeline ───────────────────────────────────────────────────────────── */

export interface DemoOrderTimeline {
  placedAt: Date;
  /** Null once paid or cancelled: the hold is over. */
  reservedUntil: Date | null;
  /** True when an unpaid order's hold has already run out. */
  holdLapsed: boolean;
  failedPaymentAt: Date | null;
  paidAt: Date | null;
  /** Event-only: `Order` has no "started preparing" column. */
  processingAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** A repeatable offset in [min, max] minutes, fixed by the order's sequence. */
function spread(sequence: number, min: number, max: number): number {
  const span = max - min + 1;
  // A small odd multiplier keeps consecutive orders from landing on the same offset.
  return min + ((sequence * 7) % span);
}

/** When the order was placed. Same-day orders are pulled back so none is ever in the future. */
export function demoPlacedAt(now: Date, spec: DemoOrderSpec): Date {
  if (spec.minutesAgo !== undefined) return new Date(now.getTime() - spec.minutesAgo * MINUTE_MS);
  const at = lagosDaysAgo(now, spec.daysAgo, spec.hour, spec.minute);
  return new Date(Math.min(at.getTime(), now.getTime() - 90_000));
}

/**
 * Every timestamp on the order and its timeline. Each step is a plausible interval
 * after the one before, and nothing is ever dated in the future.
 */
export function demoTimeline(now: Date, spec: DemoOrderSpec): DemoOrderTimeline {
  const placedAt = demoPlacedAt(now, spec);
  const holdEnds = new Date(placedAt.getTime() + siteConfig.commerce.reservationMinutes * MINUTE_MS);
  const cap = (at: number) => new Date(Math.min(at, now.getTime() - 60_000));

  if (!demoOrderWasPaid(spec)) {
    const holdLapsed = holdEnds.getTime() <= now.getTime();
    const cancelled = spec.status === "CANCELLED" ? cap(holdEnds.getTime() + MINUTE_MS) : null;
    return {
      placedAt,
      reservedUntil: spec.status === "PENDING" ? holdEnds : null,
      holdLapsed,
      failedPaymentAt: null,
      paidAt: null,
      processingAt: null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: cancelled,
      refundedAt: null,
    };
  }

  const failedPaymentAt = spec.failedAttempt ? cap(placedAt.getTime() + spread(spec.sequence, 2, 5) * MINUTE_MS) : null;
  const paidAt = cap(placedAt.getTime() + spread(spec.sequence, 4, 18) * MINUTE_MS);

  // A refunded order was a completed sale first, so it carries the whole journey.
  const fulfilled = spec.status === "REFUNDED";
  const needsProcessing: readonly DemoOrderStatus[] = ["PROCESSING", "SHIPPED", "DELIVERED"];
  const processingAt =
    needsProcessing.includes(spec.status) || fulfilled ? cap(paidAt.getTime() + spread(spec.sequence, 3, 9) * HOUR_MS) : null;

  // Collection orders are never dispatched: they go from prepared straight to collected.
  const dispatched = spec.delivery === "delivery" && (spec.status === "SHIPPED" || spec.status === "DELIVERED" || fulfilled);
  const shippedAt = dispatched ? cap((processingAt ?? paidAt).getTime() + spread(spec.sequence, 14, 26) * HOUR_MS) : null;

  const deliveredAt =
    spec.status === "DELIVERED" || fulfilled
      ? cap((shippedAt ?? processingAt ?? paidAt).getTime() + spread(spec.sequence, 20, 60) * HOUR_MS)
      : null;

  const cancelledAt = spec.status === "CANCELLED" ? cap(paidAt.getTime() + spread(spec.sequence, 2, 20) * HOUR_MS) : null;
  const refundedAt = fulfilled
    ? cap((deliveredAt ?? paidAt).getTime() + spread(spec.sequence, 24, 96) * HOUR_MS)
    : null;

  return {
    placedAt,
    reservedUntil: null,
    holdLapsed: false,
    failedPaymentAt,
    paidAt,
    processingAt,
    shippedAt,
    deliveredAt,
    cancelledAt,
    refundedAt,
  };
}

/* ── Order timeline events ──────────────────────────────────────────────── */

export interface DemoOrderEvent {
  type: string;
  fromStatus: DemoOrderStatus | null;
  toStatus: DemoOrderStatus | null;
  note: string;
  createdAt: Date;
}

export interface DemoEventContext {
  orderNumber: string;
  reference: string | null;
  trackingNumber: string | null;
  carrier: string | null;
}

/**
 * The order's history, in the shape the storefront already writes (`order_placed`,
 * `payment_confirmed`, `order_released`) plus the steps the admin will add when an
 * order is prepared, shipped, delivered or refunded.
 */
export function demoOrderEvents(
  spec: DemoOrderSpec,
  timeline: DemoOrderTimeline,
  context: DemoEventContext,
): DemoOrderEvent[] {
  const events: DemoOrderEvent[] = [
    {
      type: "order_placed",
      fromStatus: null,
      toStatus: "PENDING",
      note: `Order placed; stock held for ${siteConfig.commerce.reservationMinutes} minutes awaiting payment.`,
      createdAt: timeline.placedAt,
    },
  ];

  if (timeline.failedPaymentAt) {
    events.push({
      type: "payment_rejected",
      fromStatus: null,
      toStatus: null,
      note: `Paystack declined the first attempt (${demoPaymentReference(context.orderNumber, 1)}). The customer tried again.`,
      createdAt: timeline.failedPaymentAt,
    });
  }

  if (timeline.paidAt) {
    events.push({
      type: "payment_confirmed",
      fromStatus: "PENDING",
      toStatus: "PAID",
      note: `Paid via Paystack (card); ${context.reference ?? "demo payment"}.`,
      createdAt: timeline.paidAt,
    });
  }

  if (timeline.processingAt) {
    events.push({
      type: "order_processing",
      fromStatus: "PAID",
      toStatus: "PROCESSING",
      note: "Being prepared in the studio.",
      createdAt: timeline.processingAt,
    });
  }

  if (timeline.shippedAt) {
    const how = context.carrier && context.trackingNumber ? ` with ${context.carrier} (${context.trackingNumber})` : "";
    events.push({
      type: "order_shipped",
      fromStatus: "PROCESSING",
      toStatus: "SHIPPED",
      note: `Dispatched${how}.`,
      createdAt: timeline.shippedAt,
    });
  }

  if (timeline.deliveredAt) {
    const collected = spec.delivery === "pickup";
    events.push({
      type: collected ? "order_collected" : "order_delivered",
      fromStatus: collected ? "PROCESSING" : "SHIPPED",
      toStatus: "DELIVERED",
      note: collected ? "Collected from the studio." : "Delivered to the customer.",
      createdAt: timeline.deliveredAt,
    });
  }

  if (timeline.cancelledAt) {
    const paid = demoOrderWasPaid(spec);
    events.push({
      type: paid ? "payment_needs_refund" : "order_released",
      fromStatus: "PENDING",
      toStatus: "CANCELLED",
      note: paid
        ? "Cancelled after payment. The money still has to go back to the customer."
        : "Payment wasn't completed in time; the pieces went back on sale.",
      createdAt: timeline.cancelledAt,
    });
  }

  if (timeline.refundedAt) {
    events.push({
      type: "order_refunded",
      fromStatus: "DELIVERED",
      toStatus: "REFUNDED",
      note: spec.refund?.partial ? "Part of the order was refunded through Paystack." : "Refunded in full through Paystack.",
      createdAt: timeline.refundedAt,
    });
  }

  return events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/* ── Money ──────────────────────────────────────────────────────────────── */

export interface DemoTotalsInput {
  /** Every line's total, in kobo. */
  lineTotals: readonly Kobo[];
  /** Already-evaluated discount in kobo (0 when no code applied). */
  discount: Kobo;
  method: DeliveryMethod;
  /** Null for pickup. */
  stateCode: string | null;
}

export interface DemoOrderMoney extends OrderTotals {
  delivery: DeliveryQuote | null;
}

/**
 * The order's money, priced exactly as checkout prices it: the free-delivery
 * threshold is measured against the subtotal *after* any discount.
 */
export function demoOrderTotals(input: DemoTotalsInput): DemoOrderMoney {
  const subtotal = input.lineTotals.reduce((sum, value) => sum + value, 0);
  const discount = Math.min(input.discount, subtotal);
  const delivery = quoteDelivery({
    method: input.method,
    stateCode: input.stateCode,
    subtotal: Math.max(0, subtotal - discount),
  });
  return { ...computeTotals({ subtotal, discount, shipping: delivery?.fee ?? 0 }), delivery };
}

/** How much of a refunded order went back: the whole total, or roughly one line of it. */
export function demoRefundAmount(spec: DemoOrderSpec, total: Kobo, firstLineTotal: Kobo): Kobo {
  if (!spec.refund) return 0;
  if (!spec.refund.partial) return total;
  return Math.max(100, Math.min(total, firstLineTotal));
}

/* ── Repeatable randomness ──────────────────────────────────────────────── */

export interface DemoRandom {
  /** A number in [0, 1). */
  next(): number;
  /** A whole number in [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: tiny, fast and repeatable, so two seed runs produce the same store. */
export function createDemoRandom(seed: number): DemoRandom {
  let state = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => {
    if (max < min) throw new RangeError("max must not be below min");
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("Cannot pick from an empty list");
      return items[int(0, items.length - 1)];
    },
  };
}

export interface DemoPick<T> {
  item: T;
  quantity: number;
}

/**
 * `count` different pieces from the candidates (fewer if the shop has fewer), each
 * with a small quantity. Never picks the same piece twice, so an order can't hold
 * two lines of the identical variant.
 */
export function chooseDemoLines<T>(
  random: DemoRandom,
  candidates: readonly T[],
  count: number,
  maxQuantity = 2,
): DemoPick<T>[] {
  const wanted = Math.min(count, candidates.length);
  const taken = new Set<number>();
  const picks: DemoPick<T>[] = [];

  // Bounded: every miss is a repeat, and there are always at least `wanted` free slots.
  while (picks.length < wanted) {
    const index = random.int(0, candidates.length - 1);
    if (taken.has(index)) continue;
    taken.add(index);
    picks.push({ item: candidates[index], quantity: random.int(1, Math.max(1, maxQuantity)) });
  }
  return picks;
}

/* ── Reviews ────────────────────────────────────────────────────────────── */

export type DemoReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface DemoReviewSpec {
  key: string;
  /** Whose name it goes under; guests have no account, so the review carries the name only. */
  customer: string;
  rating: number;
  title: string;
  body: string;
  status: DemoReviewStatus;
  daysAgo: number;
  verified: boolean;
}

/**
 * Fifteen modest, plausible reviews — five still waiting, so the moderation queue
 * and the navigation badge have something to show. Every one is stored with
 * `isDemo: true` and is never shown to a customer as genuine.
 */
export const DEMO_REVIEWS: readonly DemoReviewSpec[] = [
  { key: "01", customer: "adaeze", rating: 5, title: "Beautifully made", body: "The stitching is neat and the cloth feels substantial without being heavy. It has become the piece I reach for first.", status: "APPROVED", daysAgo: 52, verified: true },
  { key: "02", customer: "tunde", rating: 4, title: "Very good, sizing runs generous", body: "Lovely finish and the colour is exactly as photographed. I would take a size down next time.", status: "APPROVED", daysAgo: 46, verified: true },
  { key: "03", customer: "chiamaka", rating: 5, title: "Worth the wait", body: "Arrived well packed and pressed. It has washed twice now with no change to the shape.", status: "APPROVED", daysAgo: 40, verified: true },
  { key: "04", customer: "folake", rating: 3, title: "Good piece, slow delivery", body: "No complaints about the making. It took a little longer to reach Ibadan than I expected.", status: "APPROVED", daysAgo: 36, verified: true },
  { key: "05", customer: "emeka", rating: 5, title: "Excellent cut", body: "Sits well across the shoulders and the sleeves are the right length for once.", status: "APPROVED", daysAgo: 31, verified: true },
  { key: "06", customer: "halima", rating: 4, title: "Comfortable in the heat", body: "Light enough for a long day out and it does not crease as much as I feared.", status: "APPROVED", daysAgo: 26, verified: false },
  { key: "07", customer: "seyi", rating: 2, title: "Not the colour I expected", body: "The piece itself is fine, but the shade is warmer in person than on screen. The exchange was handled politely.", status: "APPROVED", daysAgo: 22, verified: true },
  { key: "08", customer: "adaeze", rating: 5, title: "Second one bought", body: "I liked the first so much I ordered another in a different colour. Consistent quality both times.", status: "APPROVED", daysAgo: 17, verified: true },
  { key: "09", customer: "ibrahim", rating: 4, title: "Smart and simple", body: "Easy to dress up or down. The buttons feel solid, which is usually where things fail.", status: "REJECTED", daysAgo: 14, verified: false },
  { key: "10", customer: "folake", rating: 5, title: "Best purchase this year", body: "Buy this now buy this now cheap deals at my shop link in bio", status: "REJECTED", daysAgo: 11, verified: false },
  { key: "11", customer: "chiamaka", rating: 5, title: "Lovely finish", body: "The hem and the lining are done properly. You can tell someone cared about it.", status: "PENDING", daysAgo: 8, verified: true },
  { key: "12", customer: "emeka", rating: 4, title: "Good weight of cloth", body: "Holds its shape through a full day at work. I would like to see it in a darker shade.", status: "PENDING", daysAgo: 6, verified: true },
  { key: "13", customer: "halima", rating: 3, title: "Fits well, tag was scratchy", body: "Happy with the fit overall. I cut the label out on the first wear.", status: "PENDING", daysAgo: 4, verified: false },
  { key: "14", customer: "tunde", rating: 5, title: "Quietly impressive", body: "Nothing shouts, everything is right. The pocket placement in particular is well judged.", status: "PENDING", daysAgo: 2, verified: true },
  { key: "15", customer: "seyi", rating: 2, title: "Arrived creased", body: "The piece is well made but it came out of the bag heavily creased and needed pressing before I could wear it.", status: "PENDING", daysAgo: 1, verified: false },
];

export const DEMO_REVIEW_COUNT = DEMO_REVIEWS.length;

/* ── Summaries and checks ───────────────────────────────────────────────── */

export interface DemoPlanSummary {
  orders: number;
  customers: number;
  registeredCustomers: number;
  reviews: number;
  ordersByStatus: Record<DemoOrderStatus, number>;
  reviewsByStatus: Record<DemoReviewStatus, number>;
  refunds: number;
}

export function summariseDemoPlan(): DemoPlanSummary {
  const ordersByStatus: Record<DemoOrderStatus, number> = {
    PENDING: 0,
    PAID: 0,
    PROCESSING: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
    REFUNDED: 0,
  };
  for (const spec of DEMO_ORDER_PLAN) ordersByStatus[spec.status] += 1;

  const reviewsByStatus: Record<DemoReviewStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const review of DEMO_REVIEWS) reviewsByStatus[review.status] += 1;

  return {
    orders: DEMO_ORDER_PLAN.length,
    customers: DEMO_CUSTOMERS.length,
    registeredCustomers: DEMO_CUSTOMERS.filter((customer) => customer.registered).length,
    reviews: DEMO_REVIEWS.length,
    ordersByStatus,
    reviewsByStatus,
    refunds: DEMO_ORDER_PLAN.filter((spec) => spec.refund).length,
  };
}

/**
 * Everything wrong with the hand-written plans, in plain words. The test asserts
 * this is empty, so a mistyped plan is caught before it ever reaches a database.
 */
export function demoPlanProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();

  DEMO_ORDER_PLAN.forEach((spec, index) => {
    const where = `Order ${spec.sequence}`;
    if (spec.sequence !== index + 1) problems.push(`${where}: orders must be numbered 1…n in order.`);
    if (seen.has(spec.sequence)) problems.push(`${where}: repeated sequence number.`);
    seen.add(spec.sequence);

    if (!CUSTOMERS_BY_KEY.has(spec.customer)) problems.push(`${where}: unknown customer "${spec.customer}".`);
    if (spec.lines < 1 || spec.lines > 4) problems.push(`${where}: between 1 and 4 pieces, not ${spec.lines}.`);
    if (spec.daysAgo < 0 || spec.daysAgo > 60) problems.push(`${where}: placed ${spec.daysAgo} days ago, outside the last 60.`);
    if (spec.hour < 0 || spec.hour > 23 || spec.minute < 0 || spec.minute > 59) {
      problems.push(`${where}: ${spec.hour}:${spec.minute} is not a time of day.`);
    }
    if (index > 0 && spec.daysAgo > DEMO_ORDER_PLAN[index - 1].daysAgo) {
      problems.push(`${where}: orders must run oldest first.`);
    }
    if (spec.paidBeforeCancel && spec.status !== "CANCELLED") {
      problems.push(`${where}: only a cancelled order can have been paid before it was cancelled.`);
    }
    if (spec.refund && spec.status !== "REFUNDED" && !(spec.status === "CANCELLED" && spec.paidBeforeCancel)) {
      problems.push(`${where}: a refund needs an order that was actually paid.`);
    }
    if (spec.status === "REFUNDED" && !spec.refund) problems.push(`${where}: a refunded order needs a refund record.`);
    if (spec.failedAttempt && !demoOrderWasPaid(spec)) {
      problems.push(`${where}: a declined first attempt only makes sense before a payment that worked.`);
    }
    if (spec.minutesAgo !== undefined && spec.status !== "PENDING") {
      problems.push(`${where}: only an order awaiting payment is timed in minutes.`);
    }
    if (spec.status === "PENDING" && spec.minutesAgo === undefined) {
      problems.push(`${where}: an order awaiting payment must be timed in minutes, so its hold is live or lapsed on purpose.`);
    }
    if (spec.delivery === "pickup" && spec.status === "SHIPPED") {
      problems.push(`${where}: a collection order is never shipped.`);
    }
  });

  const reviewKeys = new Set<string>();
  for (const review of DEMO_REVIEWS) {
    const where = `Review ${review.key}`;
    if (reviewKeys.has(review.key)) problems.push(`${where}: repeated key.`);
    reviewKeys.add(review.key);
    if (!CUSTOMERS_BY_KEY.has(review.customer)) problems.push(`${where}: unknown customer "${review.customer}".`);
    if (!Number.isInteger(review.rating) || review.rating < 2 || review.rating > 5) {
      problems.push(`${where}: ratings run from 2 to 5, not ${review.rating}.`);
    }
    if (review.daysAgo < 0 || review.daysAgo > 60) problems.push(`${where}: written outside the last 60 days.`);
    if (review.title.length > 120) problems.push(`${where}: title is too long.`);
    if (review.body.length < 40 || review.body.length > 600) problems.push(`${where}: body should be a sentence or three.`);
  }

  const summary = summariseDemoPlan();
  if (summary.reviewsByStatus.PENDING < 1) problems.push("At least one review must be waiting, so moderation can be tried.");
  const statuses = Object.entries(summary.ordersByStatus).filter(([, count]) => count === 0);
  if (statuses.length > 0) problems.push(`No demo order is ${statuses.map(([status]) => status).join(", ")}.`);

  return problems;
}
