import "server-only";

import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbEnum } from "@/lib/catalog/db-enums";
import { getCatalogSource } from "@/lib/catalog/sources";
import { getDb } from "@/lib/db";

import { hashOrderAccessToken } from "./access";
import type { OrderView } from "./types";

/** Order numbers as the checkout allocates them, e.g. "ORD-2026-001284". */
const ORDER_NUMBER = /^ORD-\d{4}-\d{6,}$/;

function isOrderNumber(value: string): boolean {
  return value.length <= 32 && ORDER_NUMBER.test(value);
}

/* ── Shared shape ──────────────────────────────────────────────────────── */

const orderViewInclude = {
  items: { orderBy: { id: "asc" } },
  payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, isTest: true } },
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderViewInclude }>;

/** The one mapping from a stored order to what an order page shows — private link and account alike. */
function toOrderView(order: OrderWithDetails): OrderView {
  const lastPayment = order.payments[0];
  const zone = deliveryPolicy.zones.find((item) => item.id === order.deliveryZone);
  const method = fromDbEnum<OrderView["delivery"]["method"]>(order.deliveryMethod);

  return {
    number: order.number,
    status: fromDbEnum<OrderView["status"]>(order.status),
    paymentStatus: fromDbEnum<OrderView["paymentStatus"]>(order.paymentStatus),
    placedAt: order.createdAt.toISOString(),
    reservedUntil: order.reservedUntil?.toISOString() ?? null,
    lastPayment: lastPayment
      ? { status: fromDbEnum<OrderView["paymentStatus"]>(lastPayment.status), isTest: lastPayment.isTest }
      : null,
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productName,
      href: `/product/${item.productSlug}`,
      colorName: item.colorName,
      sizeLabel: item.sizeLabel,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    totals: {
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      shippingTotal: order.shippingTotal,
      total: order.total,
    },
    couponCode: order.couponCode,
    delivery: {
      method,
      label: method === "pickup" ? (deliveryPolicy.pickup?.name ?? "Collection") : (zone?.name ?? "Delivery"),
      estimate: order.deliveryEstimate,
      addressLines:
        method === "pickup"
          ? [deliveryPolicy.pickup?.address ?? ""].filter(Boolean)
          : [
              order.shipFullName,
              order.shipLine1,
              order.shipLine2,
              [order.shipCity, findState(order.shipState)?.name ?? order.shipState].filter(Boolean).join(", "),
              order.shipPostalCode,
            ].filter((line): line is string => Boolean(line)),
      notes: order.deliveryNotes,
    },
  };
}

/* ── Private order links ───────────────────────────────────────────────── */

/** The order a private link opens, for server-side actions on it (paying, returning from Paystack). */
export async function findOrderForAccess(orderNumber: string, key: string): Promise<{ id: string; number: string } | null> {
  if (!key || key.length > 128 || getCatalogSource() !== "database") return null;
  const order = await getDb().order.findUnique({
    where: { accessTokenHash: hashOrderAccessToken(key) },
    select: { id: true, number: true },
  });
  return order && order.number === orderNumber ? order : null;
}

/**
 * An order, for its private link. Found by the hash of the link's secret, then
 * matched against the number in the URL; anything that doesn't line up is
 * treated as not found, so the page never confirms that an order exists.
 */
export async function getOrderByAccessKey(orderNumber: string, key: string): Promise<OrderView | null> {
  if (!key || key.length > 128 || getCatalogSource() !== "database") return null;

  const order = await getDb().order.findUnique({
    where: { accessTokenHash: hashOrderAccessToken(key) },
    include: orderViewInclude,
  });
  if (!order || order.number !== orderNumber) return null;
  return toOrderView(order);
}

/* ── Orders in a customer's account ────────────────────────────────────── */

/*
 * ORDER VISIBILITY RULE. A signed-in customer sees an order when it was placed
 * while signed in to their account (order.userId = user.id) OR it was placed with
 * their email address (order.email = user.email, case-insensitively) — so guest
 * orders appear in the account as soon as the customer signs in.
 *
 * The email half is safe only because every sign-in method enabled in src/auth.ts
 * proves the customer controls that inbox: the one-time email link is delivered to
 * it, and Google only returns verified addresses. NEVER add a provider that does
 * not verify email ownership (a password sign-up without confirmation, an OAuth
 * provider that returns unverified emails) without revisiting this rule — anyone
 * could otherwise claim an address and read its orders: names, phone numbers and
 * delivery addresses.
 *
 * Every query below applies the rule twice: in the database to find candidates,
 * then exactly in code (ownsOrder), which is what decides.
 */

interface OrderViewer {
  id: string;
  email: string;
}

/** Postgres LIKE wildcards. Prisma's case-insensitive `equals` compiles to ILIKE, so they must be escaped. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function visibleTo(user: OrderViewer): Prisma.OrderWhereInput {
  const email = user.email.trim().toLowerCase();
  const conditions: Prisma.OrderWhereInput[] = [{ userId: user.id }];
  // Uses ILIKE: an unescaped "_" in "jo_ade@…" would otherwise also match "joxade@…".
  if (email) conditions.push({ email: { equals: escapeLikePattern(email), mode: "insensitive" } });
  return { OR: conditions };
}

/** The deciding check: exact, in code, whatever the database's pattern matching does. */
function ownsOrder(order: { userId: string | null; email: string }, user: OrderViewer): boolean {
  if (order.userId !== null && order.userId === user.id) return true;
  const email = user.email.trim().toLowerCase();
  return email !== "" && order.email.toLowerCase() === email;
}

/** One row of a customer's order history. */
export interface OrderSummary {
  number: string;
  /** ISO. */
  placedAt: string;
  status: OrderView["status"];
  paymentStatus: OrderView["paymentStatus"];
  /** ISO. */
  reservedUntil: string | null;
  /** Kobo. */
  total: number;
  /** Sum of quantities. */
  itemCount: number;
  /** The first up to three lines. */
  previewItems: { name: string; imageUrl: string | null }[];
}

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;

/** The customer's orders, newest first. */
export async function listOrdersForUser(
  user: { id: string; email: string },
  options: { limit?: number } = {},
): Promise<OrderSummary[]> {
  if (getCatalogSource() !== "database") return [];
  const requested = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_HISTORY_LIMIT)
    : DEFAULT_HISTORY_LIMIT;

  const orders = await getDb().order.findMany({
    where: visibleTo(user),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      number: true,
      userId: true,
      email: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      reservedUntil: true,
      total: true,
      // Every line, for the item count; orders are capped at 50 lines by checkout.
      items: { orderBy: { id: "asc" }, select: { productName: true, imageUrl: true, quantity: true } },
    },
  });

  return orders
    .filter((order) => ownsOrder(order, user))
    .map((order) => ({
      number: order.number,
      placedAt: order.createdAt.toISOString(),
      status: fromDbEnum<OrderView["status"]>(order.status),
      paymentStatus: fromDbEnum<OrderView["paymentStatus"]>(order.paymentStatus),
      reservedUntil: order.reservedUntil?.toISOString() ?? null,
      total: order.total,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      previewItems: order.items.slice(0, 3).map((item) => ({ name: item.productName, imageUrl: item.imageUrl })),
    }));
}

/** One of the customer's orders, or null — for an order that isn't theirs exactly as for one that doesn't exist. */
export async function getOrderForUser(
  user: { id: string; email: string },
  orderNumber: string,
): Promise<OrderView | null> {
  if (!isOrderNumber(orderNumber) || getCatalogSource() !== "database") return null;

  const order = await getDb().order.findFirst({
    where: { AND: [{ number: orderNumber }, visibleTo(user)] },
    include: orderViewInclude,
  });
  if (!order || !ownsOrder(order, user)) return null;
  return toOrderView(order);
}

/** The ids of one of the customer's orders, for server-side actions on it (paying, returning from Paystack). */
export async function findOrderForUser(
  user: { id: string; email: string },
  orderNumber: string,
): Promise<{ id: string; number: string } | null> {
  if (!isOrderNumber(orderNumber) || getCatalogSource() !== "database") return null;

  const order = await getDb().order.findFirst({
    where: { AND: [{ number: orderNumber }, visibleTo(user)] },
    select: { id: true, number: true, userId: true, email: true },
  });
  if (!order || !ownsOrder(order, user)) return null;
  return { id: order.id, number: order.number };
}
