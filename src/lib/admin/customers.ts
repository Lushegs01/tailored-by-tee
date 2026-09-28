import "server-only";

import {
  type CustomerCounts,
  type CustomerListQuery,
  customerTotalFor,
  phoneSearchDigits,
} from "@/components/admin/customers/customer-rules";
import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentStatus, ProductStatus, ReviewStatus } from "@/generated/prisma/enums";
import { getDb, isDatabaseConfigured } from "@/lib/db";

import { lastPage, pageOffset, PAGE_SIZE } from "./pagination";
import { containsPattern } from "./stock-state";

/*
 * Reading customers for the admin area. Nothing here writes: customer details
 * belong to the customer, and admin access is granted in Settings.
 *
 * A customer is one email address. The shop lets people buy without an account,
 * so the list is a full outer join between accounts (User) and everything ever
 * ordered, grouped by the order's own lower-cased email — the same address
 * checkout stores and the accounts adapter stores, so an exact match finds both.
 * Every search value is a bound parameter; LIKE wildcards in what the owner
 * typed are escaped, never obeyed.
 *
 * Money follows the overview page's rule exactly, so the two never disagree:
 * an order counts once it is paid and going ahead (PAID, PROCESSING, SHIPPED or
 * DELIVERED with a paidAt), for its total less any refund Paystack has actually
 * processed. Payments made with Paystack test keys are counted separately and
 * never added to real money. Demo orders are counted on their own (demo) rows,
 * which are labelled, rather than silently dropped.
 */

/* ── Failures ────────────────────────────────────────────────────────────── */

export type CustomerLoad<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_configured" | "needs_migration" | "unavailable" };

/** Postgres "relation does not exist" and "column does not exist". */
const MISSING_SCHEMA_SQLSTATE = ["42P01", "42703"];

/**
 * The admin foundation's migration hasn't been deployed: Refund, Order.isDemo and
 * User.isDemo don't exist yet, so these queries fail. Recognised through Prisma's
 * own codes and, for raw queries, the SQLSTATE Postgres reports.
 */
export function isMissingSchemaError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2021" || error.code === "P2022") return true;
  if (error.code !== "P2010") return false;
  const code = (error.meta as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && MISSING_SCHEMA_SQLSTATE.includes(code)) return true;
  return MISSING_SCHEMA_SQLSTATE.some((state) => error.message.includes(state));
}

async function load<T>(key: string, run: () => Promise<T>): Promise<CustomerLoad<T>> {
  if (!isDatabaseConfigured()) return { ok: false, reason: "not_configured" };
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, reason: "needs_migration" };
    console.error(`[admin] customers ${key} failed:`, error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }
}

/** Counts and sums come back as number, bigint or string depending on the column. */
function toNumber(value: unknown): number {
  const number = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function text(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/* ── Shared SQL ──────────────────────────────────────────────────────────── */

/** An order whose money the customer has actually parted with. */
const COUNTED = Prisma.sql`o."status" IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED') AND o."paidAt" IS NOT NULL`;

/** Refunds Paystack has returned, never more than the order was worth. */
const REFUNDED = Prisma.sql`
  LEAST(
    o."total",
    COALESCE((SELECT SUM(r."amount") FROM "Refund" r WHERE r."orderId" = o."id" AND r."status" = 'PROCESSED'), 0)
  )`;

/** True when every payment that went through on this order used Paystack test keys. */
const IS_TEST = Prisma.sql`
  COALESCE(
    (SELECT bool_and(p."isTest") FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" IN ('SUCCESS', 'REFUNDED')),
    false
  )`;

/** Digits only, so "+234 803 123 4567" and "08031234567" match the same search. */
const PHONE_DIGITS = Prisma.sql`regexp_replace(o."phone", '[^0-9]', '', 'g')`;

/** One row per order with everything the figures need, before any grouping. */
const ORDER_FACTS = Prisma.sql`
  SELECT
    lower(o."email") AS "email",
    o."createdAt",
    o."id",
    o."customerName",
    o."phone",
    ${PHONE_DIGITS} AS "phoneDigits",
    o."isDemo",
    (${COUNTED}) AS "counted",
    o."total" - ${REFUNDED} AS "net",
    ${REFUNDED} AS "refunded",
    ${IS_TEST} AS "isTest"
  FROM "Order" o`;

/* ── The list ────────────────────────────────────────────────────────────── */

export interface CustomerRow {
  /** Lower-cased; the key of the row. */
  email: string;
  /** The account's name, otherwise the name on their most recent order. */
  name: string | null;
  /** The account's id, or null for a guest. */
  userId: string | null;
  isAdmin: boolean;
  isDemo: boolean;
  /** When the account was created (ISO), or null for a guest. */
  registeredAt: string | null;
  /** Every order ever placed with this address, whatever became of it. */
  ordersTotal: number;
  /** Paid and going ahead, real money only. */
  paidOrders: number;
  /** Kobo, net of processed refunds, real money only. */
  spent: number;
  testOrders: number;
  /** Kobo, from Paystack test payments only. */
  testSpent: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export interface CustomerSummary extends CustomerCounts {
  /** Rows that are demo content. */
  demo: number;
  /** Paid orders across everything the search matched. */
  paidOrders: number;
  /** Kobo, real money. */
  spent: number;
  /** Kobo, test payments. */
  testSpent: number;
}

export interface CustomerListResult {
  rows: CustomerRow[];
  /** Rows under the current filters, for pagination. */
  total: number;
  /** The page actually shown, clamped to the last one. */
  page: number;
  summary: CustomerSummary;
}

/** Matching an order's own fields, folded into the grouped row. */
function orderMatch(query: CustomerListQuery): Prisma.Sql {
  if (query.q === "") return Prisma.sql`false`;
  const pattern = containsPattern(query.q);
  const digits = phoneSearchDigits(query.q);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`f."customerName" ILIKE ${pattern}`,
    Prisma.sql`f."email" ILIKE ${pattern}`,
  ];
  if (digits) conditions.push(Prisma.sql`f."phoneDigits" LIKE ${containsPattern(digits)}`);
  return Prisma.sql`(${Prisma.join(conditions, " OR ")})`;
}

/** The customers themselves: every account, every address that has ordered, joined. */
function customersFrom(query: CustomerListQuery): Prisma.Sql {
  return Prisma.sql`
    WITH "facts" AS (${ORDER_FACTS}),
    "grouped" AS (
      SELECT
        f."email",
        COUNT(*)::int AS "ordersTotal",
        (COUNT(*) FILTER (WHERE f."counted" AND NOT f."isTest"))::int AS "paidOrders",
        COALESCE(SUM(f."net") FILTER (WHERE f."counted" AND NOT f."isTest"), 0)::bigint AS "spent",
        (COUNT(*) FILTER (WHERE f."counted" AND f."isTest"))::int AS "testOrders",
        COALESCE(SUM(f."net") FILTER (WHERE f."counted" AND f."isTest"), 0)::bigint AS "testSpent",
        MIN(f."createdAt") AS "firstOrderAt",
        MAX(f."createdAt") AS "lastOrderAt",
        bool_or(f."isDemo") AS "isDemo",
        bool_or(${orderMatch(query)}) AS "matches",
        (array_agg(f."customerName" ORDER BY f."createdAt" DESC, f."id" DESC))[1] AS "orderName",
        (array_agg(f."phone" ORDER BY f."createdAt" DESC, f."id" DESC))[1] AS "orderPhone"
      FROM "facts" f
      GROUP BY f."email"
    )
    SELECT
      COALESCE(lower(u."email"), g."email") AS "email",
      u."id" AS "userId",
      COALESCE(NULLIF(btrim(u."name"), ''), g."orderName") AS "name",
      COALESCE(NULLIF(btrim(u."phone"), ''), g."orderPhone") AS "phone",
      COALESCE(u."role" = 'ADMIN', false) AS "isAdmin",
      (COALESCE(u."isDemo", false) OR COALESCE(g."isDemo", false)) AS "isDemo",
      u."createdAt" AS "registeredAt",
      COALESCE(g."ordersTotal", 0) AS "ordersTotal",
      COALESCE(g."paidOrders", 0) AS "paidOrders",
      COALESCE(g."spent", 0) AS "spent",
      COALESCE(g."testOrders", 0) AS "testOrders",
      COALESCE(g."testSpent", 0) AS "testSpent",
      g."firstOrderAt",
      g."lastOrderAt",
      COALESCE(g."matches", false) AS "matches"
    FROM "grouped" g
    FULL OUTER JOIN "User" u ON lower(u."email") = g."email"`;
}

/** The search, applied to the joined row (so an account with no orders is found too). */
function searchClause(query: CustomerListQuery): Prisma.Sql {
  if (query.q === "") return Prisma.empty;
  const pattern = containsPattern(query.q);
  const digits = phoneSearchDigits(query.q);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c."matches"`,
    Prisma.sql`c."email" ILIKE ${pattern}`,
    Prisma.sql`c."name" ILIKE ${pattern}`,
  ];
  if (digits) {
    conditions.push(Prisma.sql`regexp_replace(COALESCE(c."phone", ''), '[^0-9]', '', 'g') LIKE ${containsPattern(digits)}`);
  }
  return Prisma.sql`(${Prisma.join(conditions, " OR ")})`;
}

function filterClauses(query: CustomerListQuery): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];
  if (query.account === "registered") conditions.push(Prisma.sql`c."userId" IS NOT NULL`);
  if (query.account === "guest") conditions.push(Prisma.sql`c."userId" IS NULL`);
  if (query.orders === "with") conditions.push(Prisma.sql`c."ordersTotal" > 0`);
  if (query.orders === "without") conditions.push(Prisma.sql`c."ordersTotal" = 0`);
  return conditions;
}

function whereClause(conditions: Prisma.Sql[]): Prisma.Sql {
  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

function orderClause(query: CustomerListQuery): Prisma.Sql {
  const dir = Prisma.raw(query.dir === "desc" ? "DESC" : "ASC");
  // The email is unique per row, so pages can never overlap or skip.
  const tieBreak = Prisma.sql`c."email" ASC`;
  switch (query.sort) {
    case "spent":
      return Prisma.sql`ORDER BY c."spent" ${dir}, ${tieBreak}`;
    case "orders":
      return Prisma.sql`ORDER BY c."paidOrders" ${dir}, c."ordersTotal" ${dir}, ${tieBreak}`;
    case "newest":
      return Prisma.sql`ORDER BY COALESCE(c."registeredAt", c."firstOrderAt") ${dir} NULLS LAST, ${tieBreak}`;
    case "name":
      return Prisma.sql`ORDER BY lower(COALESCE(c."name", c."email")) ${dir}, ${tieBreak}`;
    default:
      return Prisma.sql`ORDER BY c."lastOrderAt" ${dir} NULLS LAST, ${tieBreak}`;
  }
}

interface RawCustomerRow {
  email: string;
  name: string | null;
  userId: string | null;
  isAdmin: boolean;
  isDemo: boolean;
  registeredAt: Date | string | null;
  ordersTotal: unknown;
  paidOrders: unknown;
  spent: unknown;
  testOrders: unknown;
  testSpent: unknown;
  firstOrderAt: Date | string | null;
  lastOrderAt: Date | string | null;
}

function toCustomerRow(row: RawCustomerRow): CustomerRow {
  return {
    email: row.email,
    name: text(row.name),
    userId: row.userId,
    isAdmin: Boolean(row.isAdmin),
    isDemo: Boolean(row.isDemo),
    registeredAt: iso(row.registeredAt),
    ordersTotal: toNumber(row.ordersTotal),
    paidOrders: toNumber(row.paidOrders),
    spent: toNumber(row.spent),
    testOrders: toNumber(row.testOrders),
    testSpent: toNumber(row.testSpent),
    firstOrderAt: iso(row.firstOrderAt),
    lastOrderAt: iso(row.lastOrderAt),
  };
}

async function selectSummary(query: CustomerListQuery): Promise<CustomerSummary> {
  const search = searchClause(query);
  const rows = await getDb().$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*)::int AS "total",
      (COUNT(*) FILTER (WHERE c."userId" IS NOT NULL))::int AS "registered",
      (COUNT(*) FILTER (WHERE c."userId" IS NOT NULL AND c."ordersTotal" > 0))::int AS "registeredWithOrders",
      (COUNT(*) FILTER (WHERE c."ordersTotal" > 0))::int AS "withOrders",
      (COUNT(*) FILTER (WHERE c."isDemo"))::int AS "demo",
      COALESCE(SUM(c."paidOrders"), 0)::int AS "paidOrders",
      COALESCE(SUM(c."spent"), 0)::bigint AS "spent",
      COALESCE(SUM(c."testSpent"), 0)::bigint AS "testSpent"
    FROM (${customersFrom(query)}) c
    ${search === Prisma.empty ? Prisma.empty : Prisma.sql`WHERE ${search}`}`;

  const row = rows[0] ?? {};
  return {
    total: toNumber(row.total),
    registered: toNumber(row.registered),
    registeredWithOrders: toNumber(row.registeredWithOrders),
    withOrders: toNumber(row.withOrders),
    demo: toNumber(row.demo),
    paidOrders: toNumber(row.paidOrders),
    spent: toNumber(row.spent),
    testSpent: toNumber(row.testSpent),
  };
}

async function selectRows(query: CustomerListQuery, limit: number, offset: number): Promise<CustomerRow[]> {
  const search = searchClause(query);
  const conditions = filterClauses(query);
  if (search !== Prisma.empty) conditions.unshift(search);

  const rows = await getDb().$queryRaw<RawCustomerRow[]>`
    SELECT
      c."email",
      c."name",
      c."userId",
      c."isAdmin",
      c."isDemo",
      c."registeredAt",
      c."ordersTotal",
      c."paidOrders",
      c."spent",
      c."testOrders",
      c."testSpent",
      c."firstOrderAt",
      c."lastOrderAt"
    FROM (${customersFrom(query)}) c
    ${whereClause(conditions)}
    ${orderClause(query)}
    LIMIT ${limit}::int OFFSET ${offset}::int`;

  return rows.map(toCustomerRow);
}

/** One page of customers with the figures for the headline stats around them. */
export async function listCustomers(
  query: CustomerListQuery,
  pageSize: number = PAGE_SIZE,
): Promise<CustomerLoad<CustomerListResult>> {
  return load("list", async () => {
    const summary = await selectSummary(query);
    const total = customerTotalFor(summary, query);
    const page = Math.min(query.page, lastPage(total, pageSize));
    const rows = total > 0 ? await selectRows(query, pageSize, pageOffset(page, pageSize)) : [];
    return { rows, total, page, summary };
  });
}

/* ── One customer's orders and money ─────────────────────────────────────── */

export interface CustomerTotals {
  ordersTotal: number;
  paidOrders: number;
  /** Kobo, net of processed refunds, real money only. */
  spent: number;
  /** Kobo returned by Paystack, real money only. */
  refunded: number;
  testOrders: number;
  /** Kobo, test payments only. */
  testSpent: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

const NO_TOTALS: CustomerTotals = {
  ordersTotal: 0,
  paidOrders: 0,
  spent: 0,
  refunded: 0,
  testOrders: 0,
  testSpent: 0,
  firstOrderAt: null,
  lastOrderAt: null,
};

export interface CustomerOrderRow {
  id: string;
  number: string;
  placedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  reservedUntil: string | null;
  /** Kobo, what the order was worth. */
  total: number;
  /** Kobo Paystack has returned on it. */
  refunded: number;
  /** Sum of the line quantities. */
  itemCount: number;
  isDemo: boolean;
  /** Every payment that went through on it used Paystack test keys. */
  isTest: boolean;
  /** The address it was placed with — not always the account's own. */
  email: string;
  /** It was placed while signed in to this account. */
  viaAccount: boolean;
}

/** Orders shown on a customer's page; older ones stay in the orders list. */
export const CUSTOMER_ORDERS_SHOWN = 50;

/*
 * WHO AN ORDER BELONGS TO. For an account this is the storefront's own rule
 * (lib/orders/queries.ts): the order was placed while signed in (userId) OR with
 * the account's email address — which is safe only because every sign-in method
 * proves the customer controls that inbox. So an admin sees exactly what the
 * customer sees in their account, including guest orders from before they
 * registered. For a guest it is simply the address itself.
 *
 * The list on /admin/customers groups by the order's own email, so a rare order
 * placed while signed in as one person but checked out with another's address
 * appears on both pages. The account page flags any order whose address differs.
 */
function ownerClause(owner: { userId?: string | null; email: string }): Prisma.Sql {
  const email = owner.email.trim().toLowerCase();
  return owner.userId
    ? Prisma.sql`(o."userId" = ${owner.userId} OR lower(o."email") = ${email})`
    : Prisma.sql`lower(o."email") = ${email}`;
}

async function selectTotals(owner: { userId?: string | null; email: string }): Promise<CustomerTotals> {
  const rows = await getDb().$queryRaw<Record<string, unknown>[]>`
    WITH "facts" AS (${ORDER_FACTS} WHERE ${ownerClause(owner)})
    SELECT
      COUNT(*)::int AS "ordersTotal",
      (COUNT(*) FILTER (WHERE f."counted" AND NOT f."isTest"))::int AS "paidOrders",
      COALESCE(SUM(f."net") FILTER (WHERE f."counted" AND NOT f."isTest"), 0)::bigint AS "spent",
      COALESCE(SUM(f."refunded") FILTER (WHERE NOT f."isTest"), 0)::bigint AS "refunded",
      (COUNT(*) FILTER (WHERE f."counted" AND f."isTest"))::int AS "testOrders",
      COALESCE(SUM(f."net") FILTER (WHERE f."counted" AND f."isTest"), 0)::bigint AS "testSpent",
      MIN(f."createdAt") AS "firstOrderAt",
      MAX(f."createdAt") AS "lastOrderAt"
    FROM "facts" f`;

  const row = rows[0];
  if (!row) return NO_TOTALS;
  return {
    ordersTotal: toNumber(row.ordersTotal),
    paidOrders: toNumber(row.paidOrders),
    spent: toNumber(row.spent),
    refunded: toNumber(row.refunded),
    testOrders: toNumber(row.testOrders),
    testSpent: toNumber(row.testSpent),
    firstOrderAt: iso(row.firstOrderAt as Date | string | null),
    lastOrderAt: iso(row.lastOrderAt as Date | string | null),
  };
}

async function selectOrders(
  owner: { userId?: string | null; email: string },
  take: number,
): Promise<CustomerOrderRow[]> {
  const email = owner.email.trim().toLowerCase();
  const where: Prisma.OrderWhereInput = owner.userId
    ? { OR: [{ userId: owner.userId }, { email }] }
    : { email };

  const orders = await getDb().order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      number: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      reservedUntil: true,
      total: true,
      isDemo: true,
      email: true,
      userId: true,
      // Checkout caps an order at 50 lines, so this stays small.
      items: { select: { quantity: true } },
      payments: { where: { status: { in: ["SUCCESS", "REFUNDED"] } }, select: { isTest: true } },
      refunds: { where: { status: "PROCESSED" }, select: { amount: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    number: order.number,
    placedAt: order.createdAt.toISOString(),
    status: order.status,
    paymentStatus: order.paymentStatus,
    reservedUntil: order.reservedUntil?.toISOString() ?? null,
    total: order.total,
    refunded: Math.min(
      order.total,
      order.refunds.reduce((sum, refund) => sum + refund.amount, 0),
    ),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    isDemo: order.isDemo,
    isTest: order.payments.length > 0 && order.payments.every((payment) => payment.isTest),
    email: order.email,
    viaAccount: owner.userId !== null && owner.userId !== undefined && order.userId === owner.userId,
  }));
}

/* ── A registered customer ───────────────────────────────────────────────── */

export interface CustomerAddress {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  /** Nigerian state code, e.g. "LA". */
  state: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

export interface CustomerWishlistItem {
  productId: string;
  name: string;
  slug: string;
  status: ProductStatus;
  addedAt: string;
}

export interface CustomerReview {
  id: string;
  rating: number;
  title: string;
  status: ReviewStatus;
  isDemo: boolean;
  isVerifiedPurchase: boolean;
  createdAt: string;
  product: { id: string; name: string };
}

export interface CustomerProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  isAdmin: boolean;
  isDemo: boolean;
  createdAt: string;
  /** They have signed in at least once (a verified email, a linked provider or a session). */
  hasSignedIn: boolean;
  addresses: CustomerAddress[];
  wishlist: { count: number; items: CustomerWishlistItem[] };
  reviews: CustomerReview[];
  reviewCount: number;
}

export interface RegisteredCustomer {
  profile: CustomerProfile;
  totals: CustomerTotals;
  orders: CustomerOrderRow[];
}

/** Wishlist pieces and reviews listed on the page; the rest are only counted. */
const WISHLIST_SHOWN = 24;
const REVIEWS_SHOWN = 10;

/** A registered customer's name, for the page title. Null when there is no such account. */
export async function getCustomerName(userId: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const user = await getDb().user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    if (!user) return null;
    return text(user.name) ?? user.email;
  } catch {
    return null;
  }
}

/**
 * Everything /admin/customers/[id] shows for one account: profile, saved
 * addresses, orders (their own and any guest orders placed with the same address
 * before they registered), wishlist and reviews. `{ ok: true, data: null }` means
 * there is no such account.
 */
export async function getRegisteredCustomer(userId: string): Promise<CustomerLoad<RegisteredCustomer | null>> {
  return load("detail", async () => {
    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isDemo: true,
        createdAt: true,
        emailVerified: true,
        _count: { select: { accounts: true, sessions: true, reviews: true } },
        addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!user) return null;

    const owner = { userId: user.id, email: user.email };
    const [totals, orders, wishlist, reviews] = await Promise.all([
      selectTotals(owner),
      selectOrders(owner, CUSTOMER_ORDERS_SHOWN),
      db.wishlist.findUnique({
        where: { userId: user.id },
        select: {
          _count: { select: { items: true } },
          items: {
            orderBy: { addedAt: "desc" },
            take: WISHLIST_SHOWN,
            select: {
              addedAt: true,
              product: { select: { id: true, name: true, slug: true, status: true } },
            },
          },
        },
      }),
      db.review.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: REVIEWS_SHOWN,
        select: {
          id: true,
          rating: true,
          title: true,
          status: true,
          isDemo: true,
          isVerifiedPurchase: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
        },
      }),
    ]);

    const profile: CustomerProfile = {
      id: user.id,
      email: user.email,
      name: text(user.name),
      phone: text(user.phone),
      isAdmin: user.role === "ADMIN",
      isDemo: user.isDemo,
      createdAt: user.createdAt.toISOString(),
      hasSignedIn: user.emailVerified !== null || user._count.accounts > 0 || user._count.sessions > 0,
      addresses: user.addresses.map((address) => ({
        id: address.id,
        label: text(address.label),
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: text(address.line2),
        city: address.city,
        state: address.state,
        postalCode: text(address.postalCode),
        country: address.country,
        isDefault: address.isDefault,
      })),
      wishlist: {
        count: wishlist?._count.items ?? 0,
        items: (wishlist?.items ?? []).map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          status: item.product.status,
          addedAt: item.addedAt.toISOString(),
        })),
      },
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        status: review.status,
        isDemo: review.isDemo,
        isVerifiedPurchase: review.isVerifiedPurchase,
        createdAt: review.createdAt.toISOString(),
        product: review.product,
      })),
      reviewCount: user._count.reviews,
    };

    return { profile, totals, orders };
  });
}

/* ── A guest ─────────────────────────────────────────────────────────────── */

export interface GuestDeliveryAddress {
  fullName: string | null;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  isPickup: boolean;
}

export interface GuestCustomer {
  email: string;
  /** From their most recent order. */
  name: string | null;
  phone: string | null;
  isDemo: boolean;
  totals: CustomerTotals;
  orders: CustomerOrderRow[];
  /** The address on their most recent delivery, for recognising a repeat customer. */
  lastAddress: GuestDeliveryAddress | null;
}

/** The account with this address, if there is one — so the guest view can send the owner there instead. */
export async function findCustomerByEmail(email: string): Promise<CustomerLoad<{ id: string } | null>> {
  return load("by-email", async () => getDb().user.findUnique({ where: { email }, select: { id: true } }));
}

/**
 * Everything known about one address that has ordered without an account.
 * `{ ok: true, data: null }` means nothing was ever ordered with it.
 */
export async function getGuestCustomer(email: string): Promise<CustomerLoad<GuestCustomer | null>> {
  return load("guest", async () => {
    const latest = await getDb().order.findFirst({
      where: { email },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        customerName: true,
        phone: true,
        deliveryMethod: true,
        shipFullName: true,
        shipPhone: true,
        shipLine1: true,
        shipLine2: true,
        shipCity: true,
        shipState: true,
        shipPostalCode: true,
      },
    });
    if (!latest) return null;

    const owner = { userId: null, email };
    const [totals, orders] = await Promise.all([selectTotals(owner), selectOrders(owner, CUSTOMER_ORDERS_SHOWN)]);
    const isPickup = latest.deliveryMethod === "PICKUP";

    return {
      email,
      name: text(latest.customerName),
      phone: text(latest.phone),
      isDemo: orders.some((order) => order.isDemo),
      totals,
      orders,
      lastAddress: {
        fullName: text(latest.shipFullName),
        phone: text(latest.shipPhone),
        line1: text(latest.shipLine1),
        line2: text(latest.shipLine2),
        city: text(latest.shipCity),
        state: text(latest.shipState),
        postalCode: text(latest.shipPostalCode),
        isPickup,
      },
    };
  });
}
