import "server-only";

import { cache } from "react";

import type { OrderListQuery } from "@/components/admin/orders/order-list-params";
import { Prisma } from "@/generated/prisma/client";
import type { DeliveryMethod, OrderStatus, PaymentStatus, RefundStatus } from "@/generated/prisma/enums";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { adjustInventory } from "@/lib/admin/inventory";
import { releaseOrder } from "@/lib/orders/reservations";
import { settlePayment, type SettleOutcome } from "@/lib/orders/payments";
import { createRefund, fetchRefund, PaystackRefundError } from "@/lib/payments/paystack-refunds";
import { isPaystackConfigured } from "@/lib/payments/paystack";

import { recordAudit } from "./audit";
import { lastPage, pageOffset, PAGE_SIZE } from "./pagination";
import {
  ACTION_AUDIT,
  ACTION_EVENT,
  ACTION_TIMESTAMP,
  ACTION_TO,
  allowed,
  STALE_MESSAGE,
  shippedWord,
  type OrderAction,
  type OrderContext,
} from "./order-transitions";

/*
 * Reading and changing orders from the admin area.
 *
 * Every write here is a conditional statement: the status the admin saw, and the
 * moment they saw it (updatedAt), are part of the WHERE clause. A competing write
 * — another admin, a Paystack webhook, the reservation sweep — waits for the row
 * lock, the condition is re-checked against the committed row, and the losing
 * write matches nothing and reports "this order changed while you were looking".
 * Nothing is read first and written back.
 *
 * Money is never decided here. A payment becomes SUCCESS only through
 * settlePayment (Paystack's own verification) and REFUNDED only through
 * Paystack's refund API. There is no code path in the admin area that marks a
 * payment as paid.
 *
 * Existing logic is reused rather than repeated: releaseOrder returns an unpaid
 * order's stock and discount-code use, settlePayment applies a verified payment,
 * adjustInventory puts refunded pieces back.
 */

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

/** At most this many rows in one CSV export. */
export const ORDERS_EXPORT_LIMIT = 2_000;

/** The database is missing a table or column this code expects (the admin migration hasn't run). */
export function isMissingSchemaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")
  );
}

export const NEEDS_MIGRATION_MESSAGE =
  "Orders can’t be changed until the latest database changes are applied. Ask your developer to run npm run db:deploy, then try again.";

/* ── Reading, without falling over ──────────────────────────────────────── */

export type OrderLoad<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_configured" | "needs_migration" | "unavailable" };

/**
 * Runs a read and turns the two things that stop it — no database at all, and a
 * database still missing the admin tables — into something the page can explain
 * instead of an error screen. Anything else is logged and reported as simply
 * unavailable: the rest of the admin area keeps working.
 */
async function load<T>(work: () => Promise<T>): Promise<OrderLoad<T>> {
  if (!isDatabaseConfigured()) return { ok: false, reason: "not_configured" };
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, reason: "needs_migration" };
    console.error("[admin] orders could not be read", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** One page of the list, and the four figures above it, for the orders page. */
export async function loadOrderList(
  query: OrderListQuery,
  pageSize = PAGE_SIZE,
): Promise<OrderLoad<{ page: OrderListPage; summary: OrderListSummary }>> {
  return load(async () => {
    const [page, summary] = await Promise.all([listOrders(query, pageSize), getOrderListSummary()]);
    return { page, summary };
  });
}

/** One order for its page. `data` is null when there is no order with that number. */
export async function loadAdminOrder(orderNumber: string): Promise<OrderLoad<AdminOrderDetail | null>> {
  return load(() => getAdminOrder(orderNumber));
}

/* ── The list ───────────────────────────────────────────────────────────── */

function listWhere(query: OrderListQuery): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (query.statuses.length > 0) where.status = { in: [...query.statuses] };
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.deliveryMethod) where.deliveryMethod = query.deliveryMethod;
  if (query.placedFrom) where.createdAt = { gte: query.placedFrom };
  if (query.isDemo !== null) where.isDemo = query.isDemo;
  if (query.isTest !== null) {
    where.payments = query.isTest ? { some: { isTest: true } } : { none: { isTest: true } };
  }

  const search = query.search;
  if (search) {
    // The text is already escaped for LIKE (see escapeLikePattern): a customer
    // searching for "100%" finds that, not every order.
    const text = search.text;
    where.OR = [
      { number: { contains: text, mode: "insensitive" } },
      { email: { contains: text, mode: "insensitive" } },
      { customerName: { contains: text, mode: "insensitive" } },
      { shipFullName: { contains: text, mode: "insensitive" } },
      { phone: { contains: text } },
      { shipPhone: { contains: text } },
      ...(search.phone ? [{ phone: { contains: search.phone } }, { shipPhone: { contains: search.phone } }] : []),
    ];
  }

  return where;
}

function listOrderBy(query: OrderListQuery): Prisma.OrderOrderByWithRelationInput[] {
  // The id tie-breaks, so two orders placed in the same millisecond never swap
  // between pages (which would hide one and repeat the other).
  return query.sort === "total"
    ? [{ total: query.dir }, { createdAt: "desc" }, { id: "desc" }]
    : [{ createdAt: query.dir }, { id: query.dir }];
}

const listSelect = {
  id: true,
  number: true,
  createdAt: true,
  customerName: true,
  email: true,
  status: true,
  paymentStatus: true,
  deliveryMethod: true,
  deliveryZone: true,
  total: true,
  isDemo: true,
  reservedUntil: true,
  items: { select: { quantity: true } },
  payments: { select: { isTest: true, status: true } },
} satisfies Prisma.OrderSelect;

type ListRow = Prisma.OrderGetPayload<{ select: typeof listSelect }>;

export interface AdminOrderRow {
  id: string;
  number: string;
  createdAt: Date;
  customerName: string;
  email: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMethod: DeliveryMethod;
  deliveryZone: string | null;
  total: number;
  isDemo: boolean;
  reservedUntil: Date | null;
  /** Lines on the order. */
  lines: number;
  /** Pieces across every line. */
  pieces: number;
  /** Every payment attempt on it was made with Paystack test keys. */
  isTest: boolean;
}

function toRow(row: ListRow): AdminOrderRow {
  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt,
    customerName: row.customerName,
    email: row.email,
    status: row.status,
    paymentStatus: row.paymentStatus,
    deliveryMethod: row.deliveryMethod,
    deliveryZone: row.deliveryZone,
    total: row.total,
    isDemo: row.isDemo,
    reservedUntil: row.reservedUntil,
    lines: row.items.length,
    pieces: row.items.reduce((sum, item) => sum + item.quantity, 0),
    isTest: row.payments.length > 0 && row.payments.every((payment) => payment.isTest),
  };
}

export interface OrderListPage {
  rows: AdminOrderRow[];
  total: number;
  /** Clamped to the last page that exists, so a stale link never shows an empty table. */
  page: number;
}

/** One page of the orders list, with the same search, filters and order as the URL. */
export async function listOrders(query: OrderListQuery, pageSize = PAGE_SIZE): Promise<OrderListPage> {
  const db = getDb();
  const where = listWhere(query);
  const total = await db.order.count({ where });
  const page = Math.min(query.page, lastPage(total, pageSize));

  const rows = await db.order.findMany({
    where,
    orderBy: listOrderBy(query),
    skip: pageOffset(page, pageSize),
    take: pageSize,
    select: listSelect,
  });

  return { rows: rows.map(toRow), total, page };
}

/** Every order the current filters match, for the CSV export (capped). */
export async function listOrdersForExport(
  query: OrderListQuery,
): Promise<{ rows: AdminOrderExportRow[]; truncated: boolean }> {
  const rows = await getDb().order.findMany({
    where: listWhere(query),
    orderBy: listOrderBy(query),
    take: ORDERS_EXPORT_LIMIT + 1,
    select: {
      ...listSelect,
      phone: true,
      subtotal: true,
      discountTotal: true,
      shippingTotal: true,
      couponCode: true,
      deliveryEstimate: true,
      shipLine1: true,
      shipLine2: true,
      shipCity: true,
      shipState: true,
      shipPostalCode: true,
      deliveryNotes: true,
      trackingNumber: true,
      carrier: true,
      paidAt: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      refundedAt: true,
    },
  });

  const truncated = rows.length > ORDERS_EXPORT_LIMIT;
  return {
    rows: rows.slice(0, ORDERS_EXPORT_LIMIT).map((row) => ({ ...toRow(row), ...row })),
    truncated,
  };
}

export type AdminOrderExportRow = AdminOrderRow & {
  phone: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  couponCode: string | null;
  deliveryEstimate: string | null;
  shipLine1: string | null;
  shipLine2: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipPostalCode: string | null;
  deliveryNotes: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
};

export interface OrderListSummary {
  toPrepare: number;
  readyToShip: number;
  awaitingPayment: number;
  refundDue: number;
}

/**
 * The four figures above the list, each a shortcut into it. They count every
 * order, test and demo included, so they agree with the navigation badge and the
 * overview page.
 */
export async function getOrderListSummary(): Promise<OrderListSummary> {
  const db = getDb();
  const [byStatus, refundDue] = await Promise.all([
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.count({ where: { status: "CANCELLED", paymentStatus: "SUCCESS" } }),
  ]);
  const count = (status: OrderStatus) =>
    byStatus.find((group) => group.status === status)?._count._all ?? 0;

  return {
    toPrepare: count("PAID"),
    readyToShip: count("PROCESSING"),
    awaitingPayment: count("PENDING"),
    refundDue,
  };
}

/* ── One order ──────────────────────────────────────────────────────────── */

const detailSelect = {
  id: true,
  number: true,
  status: true,
  paymentStatus: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
  cancelledAt: true,
  shippedAt: true,
  deliveredAt: true,
  refundedAt: true,
  reservedUntil: true,
  isDemo: true,
  userId: true,
  email: true,
  phone: true,
  customerName: true,
  subtotal: true,
  discountTotal: true,
  shippingTotal: true,
  total: true,
  couponCode: true,
  deliveryMethod: true,
  deliveryZone: true,
  deliveryEstimate: true,
  shipFullName: true,
  shipPhone: true,
  shipLine1: true,
  shipLine2: true,
  shipCity: true,
  shipState: true,
  shipPostalCode: true,
  shipCountry: true,
  deliveryNotes: true,
  trackingNumber: true,
  carrier: true,
  user: { select: { id: true, name: true, email: true, isDemo: true } },
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      productId: true,
      variantId: true,
      productName: true,
      productSlug: true,
      sku: true,
      colorName: true,
      sizeLabel: true,
      imageUrl: true,
      unitPrice: true,
      compareAtUnitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
  payments: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      amount: true,
      currency: true,
      status: true,
      channel: true,
      gatewayResponse: true,
      providerTransactionId: true,
      isTest: true,
      paidAt: true,
      verifiedAt: true,
      createdAt: true,
    },
  },
  refunds: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      paymentId: true,
      amount: true,
      status: true,
      providerReference: true,
      reason: true,
      restocked: true,
      createdAt: true,
      updatedAt: true,
      actor: { select: { name: true, email: true } },
    },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export type AdminOrderDetail = Prisma.OrderGetPayload<{ select: typeof detailSelect }> & {
  /** What the transition rules are told about this order right now. */
  context: OrderContext;
  /** Successful payments with money still to return, newest first. */
  refundable: RefundablePayment[];
};

export interface RefundablePayment {
  id: string;
  reference: string;
  amount: number;
  /** Integer kobo not yet claimed by a refund. */
  remaining: number;
  isTest: boolean;
  paidAt: Date | null;
}

type DetailRow = Prisma.OrderGetPayload<{ select: typeof detailSelect }>;

/** A payment's money is spoken for by any refund that hasn't failed. */
function claimedByRefunds(
  paymentId: string,
  refunds: readonly { paymentId: string; amount: number; status: RefundStatus }[],
): number {
  return refunds
    .filter((refund) => refund.paymentId === paymentId && refund.status !== "FAILED")
    .reduce((sum, refund) => sum + refund.amount, 0);
}

function refundablePayments(row: {
  payments: readonly { id: string; reference: string; amount: number; status: PaymentStatus; isTest: boolean; paidAt: Date | null }[];
  refunds: readonly { paymentId: string; amount: number; status: RefundStatus }[];
}): RefundablePayment[] {
  return row.payments
    .filter((payment) => payment.status === "SUCCESS" || payment.status === "REFUNDED")
    .map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      remaining: Math.max(0, payment.amount - claimedByRefunds(payment.id, row.refunds)),
      isTest: payment.isTest,
      paidAt: payment.paidAt,
    }));
}

function buildContext(row: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMethod: DeliveryMethod;
  payments: readonly { id: string; reference: string; amount: number; status: PaymentStatus; isTest: boolean; paidAt: Date | null }[];
  refunds: readonly { paymentId: string; amount: number; status: RefundStatus }[];
}): OrderContext {
  const settled = refundablePayments(row);
  return {
    status: row.status,
    paymentStatus: row.paymentStatus,
    deliveryMethod: row.deliveryMethod,
    paid: settled.length > 0,
    refundInProgress: row.refunds.some((refund) => refund.status === "PENDING"),
    fullyRefunded: settled.length > 0 && settled.every((payment) => payment.remaining === 0),
    hasPaymentToCheck: row.payments.length > 0,
  };
}

function toDetail(row: DetailRow): AdminOrderDetail {
  return { ...row, context: buildContext(row), refundable: refundablePayments(row) };
}

/**
 * One order and everything its page shows, by its number. Cached per request, so
 * generateMetadata and the page itself share a single query.
 */
export const getAdminOrder = cache(async (orderNumber: string): Promise<AdminOrderDetail | null> => {
  const row = await getDb().order.findUnique({ where: { number: orderNumber }, select: detailSelect });
  return row ? toDetail(row) : null;
});

/* ── Changing an order ──────────────────────────────────────────────────── */

/** The order as the admin saw it when the page rendered. */
export interface OrderExpectation {
  status: OrderStatus;
  updatedAt: Date;
}

export type OrderWriteFailure =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "stale"; message: string }
  | { ok: false; reason: "not_allowed"; message: string }
  | { ok: false; reason: "provider"; message: string };

export type OrderWriteResult<T> = ({ ok: true } & T) | OrderWriteFailure;

const stale = (): OrderWriteFailure => ({ ok: false, reason: "stale", message: STALE_MESSAGE });

/** Who made the change, for the timeline note. */
function actorNote(note: string | null | undefined): string | null {
  const text = typeof note === "string" ? note.trim().slice(0, 500) : "";
  return text === "" ? null : text;
}

/** A status step: conditional update, then the timeline entry and audit row in the same transaction. */
export interface TransitionInput {
  orderNumber: string;
  action: Extract<OrderAction, "start_processing" | "mark_shipped" | "mark_delivered" | "cancel_paid">;
  expected: OrderExpectation;
  actorId: string;
  /** mark_shipped only, and only for a delivery. */
  carrier?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
}

export interface TransitionSuccess {
  orderId: string;
  orderNumber: string;
  from: OrderStatus;
  to: OrderStatus;
  deliveryMethod: DeliveryMethod;
  /** The update the customer should be emailed, or null when this step sends none. */
  emailStatus: "SHIPPED" | "DELIVERED" | null;
}

export async function applyTransition(input: TransitionInput): Promise<OrderWriteResult<TransitionSuccess>> {
  const order = await getDb().order.findUnique({
    where: { number: input.orderNumber },
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      updatedAt: true,
      deliveryMethod: true,
      payments: { select: { id: true, reference: true, amount: true, status: true, isTest: true, paidAt: true } },
      refunds: { select: { paymentId: true, amount: true, status: true } },
    },
  });
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== input.expected.status || order.updatedAt.getTime() !== input.expected.updatedAt.getTime()) {
    return stale();
  }

  const permitted = allowed(input.action, buildContext(order));
  if (!permitted.ok) return { ok: false, reason: "not_allowed", message: permitted.reason };

  const to = ACTION_TO[input.action];
  if (!to) return { ok: false, reason: "not_allowed", message: "This step doesn’t change the order’s status." };

  const timestampField = ACTION_TIMESTAMP[input.action];
  const now = new Date();
  const data: Prisma.OrderUpdateManyMutationInput = { status: to };
  if (timestampField) data[timestampField] = now;
  if (input.action === "mark_shipped") {
    data.carrier = input.carrier?.trim() || null;
    data.trackingNumber = input.trackingNumber?.trim() || null;
  }

  const deliveryMethod = order.deliveryMethod;
  const trackingNote =
    input.action === "mark_shipped" && (data.trackingNumber || data.carrier)
      ? ` Tracking: ${[data.carrier, data.trackingNumber].filter(Boolean).join(" ")}.`
      : "";

  const result = await getDb().$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      // The status and the exact moment the admin saw: a webhook, a sweep or
      // another admin getting there first makes this match nothing.
      where: { id: order.id, status: input.expected.status, updatedAt: input.expected.updatedAt },
      data,
    });
    if (claimed.count === 0) return null;

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: ACTION_EVENT[input.action],
        fromStatus: order.status,
        toStatus: to,
        note: actorNote(input.note) ?? `${transitionNote(input.action, deliveryMethod)}${trackingNote}`,
        actorId: input.actorId,
      },
    });

    await recordAudit({
      actorId: input.actorId,
      action: ACTION_AUDIT[input.action],
      entityType: "Order",
      entityId: order.id,
      summary: `${transitionNote(input.action, deliveryMethod)} on ${order.number}.`,
      metadata: { orderNumber: order.number, from: order.status, to },
      tx,
    });

    return true;
  }, TRANSACTION);

  if (!result) return stale();

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.number,
    from: order.status,
    to,
    deliveryMethod,
    emailStatus: to === "SHIPPED" ? "SHIPPED" : to === "DELIVERED" ? "DELIVERED" : null,
  };
}

function transitionNote(action: TransitionInput["action"], deliveryMethod: DeliveryMethod): string {
  switch (action) {
    case "start_processing":
      return "Started preparing";
    case "mark_shipped":
      return `Marked ${shippedWord(deliveryMethod)}`;
    case "mark_delivered":
      return deliveryMethod === "PICKUP" ? "Marked collected" : "Marked delivered";
    case "cancel_paid":
      return "Cancelled a paid order — the payment still needs refunding";
  }
}

/**
 * Cancels an unpaid order. The work is releaseOrder's: one conditional claim
 * (PENDING and not paid) that returns the held pieces and the discount-code use,
 * exactly once however many sweeps race for it. All that's added here is who
 * asked, on the timeline.
 */
export async function cancelUnpaidOrder(input: {
  orderNumber: string;
  expected: OrderExpectation;
  actorId: string;
  note?: string | null;
}): Promise<OrderWriteResult<{ orderId: string; orderNumber: string }>> {
  const db = getDb();
  const order = await db.order.findUnique({
    where: { number: input.orderNumber },
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      updatedAt: true,
      deliveryMethod: true,
      payments: { select: { id: true, reference: true, amount: true, status: true, isTest: true, paidAt: true } },
      refunds: { select: { paymentId: true, amount: true, status: true } },
    },
  });
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== input.expected.status || order.updatedAt.getTime() !== input.expected.updatedAt.getTime()) {
    return stale();
  }

  const permitted = allowed("cancel_unpaid", buildContext(order));
  if (!permitted.ok) return { ok: false, reason: "not_allowed", message: permitted.reason };

  const released = await releaseOrder(order.id, "cancelled");
  // False means the order settled between the check and the claim (a payment landed,
  // or a sweep got there first). Nothing was changed.
  if (!released) return stale();

  // releaseOrder has already written its own "order_released" entry and committed;
  // this pair records who asked. Best effort: the cancellation itself has happened.
  try {
    await db.$transaction(async (tx) => {
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: ACTION_EVENT.cancel_unpaid,
          fromStatus: "PENDING",
          toStatus: "CANCELLED",
          note: actorNote(input.note) ?? "Cancelled in the admin area; the pieces went back on sale.",
          actorId: input.actorId,
        },
      });
      await recordAudit({
        actorId: input.actorId,
        action: ACTION_AUDIT.cancel_unpaid,
        entityType: "Order",
        entityId: order.id,
        summary: `Cancelled the unpaid order ${order.number}.`,
        metadata: { orderNumber: order.number, from: "PENDING", to: "CANCELLED", paid: false },
        tx,
      });
    }, TRANSACTION);
  } catch (error) {
    console.error(`[admin] ${order.number} was cancelled but its record could not be written`, error);
  }

  return { ok: true, orderId: order.id, orderNumber: order.number };
}

/** Adds or corrects the courier details on an order that has already shipped. */
export async function saveTracking(input: {
  orderNumber: string;
  expected: OrderExpectation;
  carrier: string | null;
  trackingNumber: string | null;
  actorId: string;
}): Promise<OrderWriteResult<{ orderId: string; orderNumber: string }>> {
  const order = await getDb().order.findUnique({
    where: { number: input.orderNumber },
    select: { id: true, number: true, status: true, updatedAt: true, deliveryMethod: true },
  });
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== input.expected.status || order.updatedAt.getTime() !== input.expected.updatedAt.getTime()) {
    return stale();
  }
  if (order.deliveryMethod === "PICKUP") {
    return { ok: false, reason: "not_allowed", message: "A collection order has no courier to track." };
  }

  const carrier = input.carrier?.trim() || null;
  const trackingNumber = input.trackingNumber?.trim() || null;

  const changed = await getDb().$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: input.expected.status, updatedAt: input.expected.updatedAt },
      data: { carrier, trackingNumber },
    });
    if (claimed.count === 0) return false;

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "tracking_updated",
        note:
          carrier || trackingNumber
            ? `Tracking set to ${[carrier, trackingNumber].filter(Boolean).join(" ")}.`
            : "Tracking details removed.",
        actorId: input.actorId,
      },
    });
    await recordAudit({
      actorId: input.actorId,
      action: "order.tracking",
      entityType: "Order",
      entityId: order.id,
      summary: `Updated the tracking details on ${order.number}.`,
      metadata: { orderNumber: order.number },
      tx,
    });
    return true;
  }, TRANSACTION);

  return changed ? { ok: true, orderId: order.id, orderNumber: order.number } : stale();
}

/** An internal note on the order's timeline. Customers never see it. */
export async function addOrderNote(input: {
  orderNumber: string;
  note: string;
  actorId: string;
}): Promise<OrderWriteResult<{ orderId: string; orderNumber: string }>> {
  const order = await getDb().order.findUnique({
    where: { number: input.orderNumber },
    select: { id: true, number: true },
  });
  if (!order) return { ok: false, reason: "not_found" };

  const note = actorNote(input.note);
  if (!note) return { ok: false, reason: "not_allowed", message: "Write the note before saving it." };

  await getDb().orderEvent.create({
    data: { orderId: order.id, type: "note", note, actorId: input.actorId },
  });
  return { ok: true, orderId: order.id, orderNumber: order.number };
}

/* ── Payments ───────────────────────────────────────────────────────────── */

export interface RecheckSuccess {
  orderId: string;
  orderNumber: string;
  outcome: SettleOutcome;
  message: string;
}

const SETTLE_MESSAGES: Record<SettleOutcome, string> = {
  paid: "Paystack confirmed the payment. The order is paid and its pieces are sold.",
  paid_after_release: "Paystack confirmed a late payment, and every piece was still available. The order is paid.",
  already_paid: "Paystack had already confirmed this payment; nothing changed.",
  needs_refund: "Paystack confirmed a payment that can’t be fulfilled. It needs refunding — see the timeline.",
  pending: "Paystack says the payment is still going through. Check again in a few minutes.",
  awaiting_customer: "Paystack is waiting on the customer to finish paying.",
  failed: "Paystack says the payment failed. The customer can try again from their order page.",
  abandoned: "Paystack says the customer left before paying. The checkout is still open to them.",
  rejected: "Paystack reported a payment that doesn’t match this order. It has been recorded for you to look into.",
  unknown_reference: "Paystack has no record of this attempt.",
};

/**
 * Asks Paystack what happened to the order's latest payment attempt, and applies
 * its answer. Verification is entirely server-side (settlePayment): this only
 * decides which attempt to ask about and records who asked.
 */
export async function recheckPayment(input: {
  orderNumber: string;
  expected: OrderExpectation;
  actorId: string;
}): Promise<OrderWriteResult<RecheckSuccess>> {
  if (!isPaystackConfigured()) {
    return { ok: false, reason: "provider", message: "Paystack isn’t set up, so payments can’t be checked." };
  }

  const db = getDb();
  const order = await db.order.findUnique({
    where: { number: input.orderNumber },
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      updatedAt: true,
      deliveryMethod: true,
      payments: {
        orderBy: { createdAt: "desc" },
        select: { id: true, reference: true, amount: true, status: true, isTest: true, paidAt: true },
      },
      refunds: { select: { paymentId: true, amount: true, status: true } },
    },
  });
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== input.expected.status || order.updatedAt.getTime() !== input.expected.updatedAt.getTime()) {
    return stale();
  }

  const permitted = allowed("recheck_payment", buildContext(order));
  if (!permitted.ok) return { ok: false, reason: "not_allowed", message: permitted.reason };

  const latest = order.payments[0];
  if (!latest) {
    return { ok: false, reason: "not_allowed", message: "No payment has been started for this order." };
  }

  let outcome: SettleOutcome;
  try {
    outcome = await settlePayment(latest.reference);
  } catch (error) {
    console.error(`[admin] could not re-check ${latest.reference}`, error);
    return {
      ok: false,
      reason: "provider",
      message: "Paystack couldn’t be reached just now. Try again in a moment.",
    };
  }

  const message = SETTLE_MESSAGES[outcome];
  // Both records are best effort: Paystack has already been asked and its answer
  // applied, so a record that can't be written must not undo any of that.
  try {
    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: ACTION_EVENT.recheck_payment,
        note: `Checked ${latest.reference} with Paystack: ${message}`,
        actorId: input.actorId,
      },
    });
  } catch (error) {
    console.error(`[admin] could not record the payment check for ${order.number}`, error);
  }

  await recordAudit({
    actorId: input.actorId,
    action: ACTION_AUDIT.recheck_payment,
    entityType: "Order",
    entityId: order.id,
    summary: `Asked Paystack about the payment for ${order.number}.`,
    metadata: { orderNumber: order.number, reference: latest.reference, outcome },
  });

  return { ok: true, orderId: order.id, orderNumber: order.number, outcome, message };
}

/* ── Refunds ────────────────────────────────────────────────────────────── */

export interface RefundRequest {
  orderNumber: string;
  expected: OrderExpectation;
  /** Which successful payment to return. Checked to belong to this order. */
  paymentId: string;
  reason: string | null;
  /** Put the pieces back on sale (they're physically back in the studio). */
  restock: boolean;
  actorId: string;
}

export interface RefundSuccess {
  orderId: string;
  orderNumber: string;
  refundId: string;
  status: RefundStatus;
  amount: number;
  restocked: boolean;
  isTest: boolean;
  message: string;
}

const REFUND_MESSAGES: Record<RefundStatus, string> = {
  PROCESSED: "Paystack has returned the money to the customer.",
  PENDING: "Paystack has the refund. Banks can take several working days — use “Check refund status” to follow it.",
  FAILED: "Paystack could not process the refund.",
};

/**
 * Asks Paystack to return a payment.
 *
 * 1. The payment row is locked and its refunds re-read under that lock, so only
 *    one open refund per payment can ever exist, however many admins click at once.
 * 2. The Refund row is created PENDING inside that transaction, with the acting
 *    admin, before Paystack is called — so a refund is never in flight without a record.
 * 3. Paystack's answer is applied in a second transaction.
 *
 * If Paystack can't be reached, the refund is marked FAILED with a note saying
 * its state is unknown: Paystack itself refuses a second full refund of the same
 * transaction, so trying again is safe, and the note tells the owner to check the
 * Paystack dashboard first.
 */
export async function requestRefund(input: RefundRequest): Promise<OrderWriteResult<RefundSuccess>> {
  if (!isPaystackConfigured()) {
    return { ok: false, reason: "provider", message: "Paystack isn’t set up, so refunds can’t be made." };
  }

  const db = getDb();
  const order = await db.order.findUnique({
    where: { number: input.orderNumber },
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      updatedAt: true,
      deliveryMethod: true,
      payments: { select: { id: true, reference: true, amount: true, status: true, isTest: true, paidAt: true } },
      refunds: { select: { paymentId: true, amount: true, status: true } },
      items: { select: { variantId: true, quantity: true, productName: true } },
    },
  });
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status !== input.expected.status || order.updatedAt.getTime() !== input.expected.updatedAt.getTime()) {
    return stale();
  }

  const permitted = allowed("refund", buildContext(order));
  if (!permitted.ok) return { ok: false, reason: "not_allowed", message: permitted.reason };

  const payment = order.payments.find((candidate) => candidate.id === input.paymentId);
  if (!payment || (payment.status !== "SUCCESS" && payment.status !== "REFUNDED")) {
    return { ok: false, reason: "not_allowed", message: "That payment can’t be refunded." };
  }

  /* 1 + 2: claim the refund under the payment's own lock. */
  let created: { refundId: string; amount: number };
  try {
    const claim = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
      // Re-read the order under the same transaction: the guard must still hold.
      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true, updatedAt: true },
      });
      if (
        !current ||
        current.status !== input.expected.status ||
        current.updatedAt.getTime() !== input.expected.updatedAt.getTime()
      ) {
        return { claimed: false as const };
      }

      const existing = await tx.refund.findMany({
        where: { paymentId: payment.id },
        select: { amount: true, status: true },
      });
      if (existing.some((refund) => refund.status === "PENDING")) {
        return { claimed: false as const, reason: "A refund for this payment is already with Paystack." };
      }
      const remaining =
        payment.amount -
        existing.filter((refund) => refund.status !== "FAILED").reduce((sum, refund) => sum + refund.amount, 0);
      if (remaining <= 0) {
        return { claimed: false as const, reason: "This payment has already been refunded in full." };
      }

      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amount: remaining,
          status: "PENDING",
          reason: actorNote(input.reason),
          restocked: false,
          actorId: input.actorId,
        },
        select: { id: true },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: ACTION_EVENT.refund,
          note: `Refund of ${remaining} kobo requested from Paystack for ${payment.reference}.`,
          actorId: input.actorId,
        },
      });
      await recordAudit({
        actorId: input.actorId,
        action: "refund.create",
        entityType: "Refund",
        entityId: refund.id,
        summary: `Asked Paystack to refund ${order.number}.`,
        metadata: { orderNumber: order.number, orderId: order.id, amount: remaining, reference: payment.reference },
        tx,
      });
      return { claimed: true as const, refundId: refund.id, amount: remaining };
    }, TRANSACTION);

    if (!claim.claimed) {
      return claim.reason
        ? { ok: false, reason: "not_allowed", message: claim.reason }
        : stale();
    }
    created = { refundId: claim.refundId, amount: claim.amount };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, reason: "provider", message: NEEDS_MIGRATION_MESSAGE };
    throw error;
  }

  /* 3: ask Paystack, then apply its answer. */
  try {
    const paystack = await createRefund({ reference: payment.reference, amount: created.amount });
    const applied = await finaliseRefund({
      refundId: created.refundId,
      orderId: order.id,
      orderNumber: order.number,
      paymentId: payment.id,
      providerReference: paystack.id,
      outcome: paystack.outcome,
      providerStatus: paystack.status,
      restock: input.restock,
      actorId: input.actorId,
      items: order.items,
    });

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.number,
      refundId: created.refundId,
      status: applied.status,
      amount: created.amount,
      restocked: applied.restocked,
      isTest: payment.isTest,
      message: REFUND_MESSAGES[applied.status],
    };
  } catch (error) {
    const detail =
      error instanceof PaystackRefundError
        ? error.retryable
          ? `Paystack couldn’t be reached (${error.message}). It is not known whether the refund was created.`
          : `Paystack refused the refund: ${error.message}`
        : "Paystack could not be reached.";
    console.error(`[admin] refund for ${order.number} failed`, error);

    await markRefundFailed(created.refundId, order.id, detail, input.actorId).catch((recordError: unknown) => {
      console.error(`[admin] could not record the failed refund for ${order.number}`, recordError);
    });

    const advice =
      error instanceof PaystackRefundError && error.retryable
        ? " Check the Paystack dashboard before trying again."
        : "";
    return { ok: false, reason: "provider", message: `${detail}${advice}` };
  }
}

async function markRefundFailed(
  refundId: string,
  orderId: string,
  detail: string,
  actorId: string,
): Promise<void> {
  await getDb().$transaction(async (tx) => {
    const claimed = await tx.refund.updateMany({
      where: { id: refundId, status: "PENDING" },
      data: { status: "FAILED", reason: detail.slice(0, 500) },
    });
    if (claimed.count === 0) return;
    await tx.orderEvent.create({
      data: { orderId, type: "refund_failed", note: detail.slice(0, 500), actorId },
    });
  }, TRANSACTION);
}

interface FinaliseInput {
  refundId: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  providerReference: string;
  outcome: "processed" | "pending" | "failed";
  providerStatus: string;
  /** Put the pieces back on sale. Ignored once the refund row already says they went back. */
  restock: boolean;
  actorId: string;
  items: readonly { variantId: string | null; quantity: number; productName: string }[];
}

/**
 * Writes what Paystack said. One transaction, all of it conditional:
 * - the refund row moves on only from PENDING;
 * - the payment becomes REFUNDED, and the order REFUNDED, only when nothing is
 *   left to return on any of the order's payments;
 * - pieces go back into stock through adjustInventory (ORDER_RETURNED, with the
 *   order and the acting admin), and only once — `restocked` records it.
 *
 * Pieces are returned as soon as Paystack accepts the refund, not when the bank
 * finishes: the goods are physically back in the studio, and the owner asked for
 * them to be sellable.
 */
async function finaliseRefund(input: FinaliseInput): Promise<{ status: RefundStatus; restocked: boolean }> {
  const status: RefundStatus =
    input.outcome === "processed" ? "PROCESSED" : input.outcome === "failed" ? "FAILED" : "PENDING";

  return getDb().$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: input.refundId },
      select: { status: true, amount: true, restocked: true },
    });
    if (!refund) return { status, restocked: false };

    // Only the call that still finds the refund open may act on it: a second one
    // (a retry, or two admins at once) must not put the same pieces back twice.
    const shouldRestock =
      input.restock && refund.status === "PENDING" && !refund.restocked && input.outcome !== "failed";

    await tx.refund.updateMany({
      where: { id: input.refundId, status: "PENDING" },
      data: {
        status,
        providerReference: input.providerReference,
        ...(shouldRestock ? { restocked: true } : {}),
      },
    });

    let restocked = refund.restocked;
    if (shouldRestock) {
      for (const item of input.items) {
        if (!item.variantId || item.quantity <= 0) continue;
        const result = await adjustInventory({
          variantId: item.variantId,
          delta: item.quantity,
          reason: "ORDER_RETURNED",
          note: `Returned with the refund of ${input.orderNumber}`,
          orderId: input.orderId,
          actorId: input.actorId,
          tx,
        });
        if (!result.ok) {
          console.error(`[admin] could not return ${item.productName} to stock for ${input.orderNumber}: ${result.reason}`);
        }
      }
      restocked = true;
      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: "refund_restocked",
          note: "The refunded pieces were put back on sale.",
          actorId: input.actorId,
        },
      });
    }

    if (input.outcome === "processed") {
      // Nothing left to return on any payment: the order itself is refunded.
      const [payments, refunds] = await Promise.all([
        tx.payment.findMany({
          where: { orderId: input.orderId, status: { in: ["SUCCESS", "REFUNDED"] } },
          select: { id: true, amount: true },
        }),
        tx.refund.findMany({
          where: { orderId: input.orderId, status: { not: "FAILED" } },
          select: { paymentId: true, amount: true },
        }),
      ]);
      const outstanding = payments.reduce((sum, payment) => {
        const claimed = refunds
          .filter((refund) => refund.paymentId === payment.id)
          .reduce((total, refund) => total + refund.amount, 0);
        return sum + Math.max(0, payment.amount - claimed);
      }, 0);

      await tx.payment.updateMany({ where: { id: input.paymentId }, data: { status: "REFUNDED" } });

      if (outstanding === 0) {
        const now = new Date();
        await tx.order.updateMany({
          where: { id: input.orderId, status: { not: "REFUNDED" } },
          data: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedAt: now },
        });
      }
    }

    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        type:
          input.outcome === "processed"
            ? "refund_processed"
            : input.outcome === "failed"
              ? "refund_failed"
              : "refund_pending",
        note: `Paystack reported the refund as “${input.providerStatus}”. Reference ${input.providerReference}.`,
        actorId: input.actorId,
      },
    });

    return { status, restocked };
  }, TRANSACTION);
}

export interface CheckRefundSuccess {
  orderId: string;
  orderNumber: string;
  status: RefundStatus;
  message: string;
}

/** Asks Paystack what became of a refund it already has, and finishes it off. */
export async function checkRefundStatus(input: {
  orderNumber: string;
  refundId: string;
  actorId: string;
}): Promise<OrderWriteResult<CheckRefundSuccess>> {
  if (!isPaystackConfigured()) {
    return { ok: false, reason: "provider", message: "Paystack isn’t set up, so refunds can’t be checked." };
  }

  const db = getDb();
  const refund = await db.refund.findUnique({
    where: { id: input.refundId },
    select: {
      id: true,
      status: true,
      providerReference: true,
      paymentId: true,
      restocked: true,
      order: {
        select: {
          id: true,
          number: true,
          items: { select: { variantId: true, quantity: true, productName: true } },
        },
      },
    },
  });
  if (!refund || refund.order.number !== input.orderNumber) return { ok: false, reason: "not_found" };
  if (refund.status !== "PENDING") {
    return { ok: false, reason: "not_allowed", message: "This refund has already finished." };
  }
  if (!refund.providerReference) {
    return {
      ok: false,
      reason: "not_allowed",
      message: "Paystack never gave this refund a reference, so it can’t be followed up. Check the Paystack dashboard.",
    };
  }

  let paystackStatus: string;
  let outcome: "processed" | "pending" | "failed";
  try {
    const remote = await fetchRefund(refund.providerReference);
    paystackStatus = remote.status;
    outcome = remote.outcome;
  } catch (error) {
    console.error(`[admin] could not check the refund for ${input.orderNumber}`, error);
    const message =
      error instanceof PaystackRefundError
        ? `Paystack couldn’t tell us: ${error.message}`
        : "Paystack couldn’t be reached just now.";
    return { ok: false, reason: "provider", message };
  }

  if (outcome === "pending") {
    return {
      ok: true,
      orderId: refund.order.id,
      orderNumber: refund.order.number,
      status: "PENDING",
      message: `Paystack still reports this refund as “${paystackStatus}”. Banks can take several working days.`,
    };
  }

  const applied = await finaliseRefund({
    refundId: refund.id,
    orderId: refund.order.id,
    orderNumber: refund.order.number,
    paymentId: refund.paymentId,
    providerReference: refund.providerReference,
    outcome,
    providerStatus: paystackStatus,
    // The pieces were dealt with when the refund was accepted; never twice.
    restock: false,
    actorId: input.actorId,
    items: refund.order.items,
  });

  return {
    ok: true,
    orderId: refund.order.id,
    orderNumber: refund.order.number,
    status: applied.status,
    message: REFUND_MESSAGES[applied.status],
  };
}
