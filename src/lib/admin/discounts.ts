import "server-only";

import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentStatus, ProductStatus } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

import { recordAudit } from "./audit";
import {
  changesDiscountAmount,
  describeDiscountChanges,
  describeDiscountRule,
  DISCOUNT_STATUSES,
  discountStatus,
  type DiscountInput,
  type DiscountSnapshot,
  type DiscountStatus,
  type DiscountType,
} from "./discount-schema";
import { lastPage, pageOffset, PAGE_SIZE, type ListParams } from "./pagination";

/*
 * Discount codes (Coupon) for the admin area: the list, one code with its
 * orders, and every change. Checkout reads the same rows live
 * (lib/commerce/coupons.ts), so nothing here touches the storefront's cached
 * catalogue.
 *
 * Writes run in a transaction with their AuditLog entry naming the admin. The
 * counters checkout maintains (usageCount) are never written here: an edit locks
 * the code's row, so it waits for (and then sees) any order being placed with
 * it at that moment, and a delete re-checks under the same lock that no order
 * has used the code.
 */

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

/** Orders that have been paid for and are going ahead (not cancelled or refunded). */
const PAID_ORDER_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

/* ── Reading ────────────────────────────────────────────────────────────── */

const compareNames = (a: string, b: string) => a.localeCompare(b, "en-GB", { sensitivity: "base" });

const listSelect = {
  id: true,
  code: true,
  description: true,
  type: true,
  value: true,
  minSubtotal: true,
  maxDiscount: true,
  startsAt: true,
  endsAt: true,
  usageLimit: true,
  usageCount: true,
  perCustomerLimit: true,
  isActive: true,
  createdAt: true,
  categories: { select: { category: { select: { name: true } } } },
  products: { select: { product: { select: { name: true } } } },
} satisfies Prisma.CouponSelect;

export interface DiscountListRow {
  id: string;
  code: string;
  description: string | null;
  type: DiscountType;
  value: number;
  minSubtotal: number | null;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  createdAt: Date;
  categoryNames: string[];
  productNames: string[];
}

function statusWhere(status: DiscountStatus, now: Date): Prisma.CouponWhereInput {
  const fields = getDb().coupon.fields;
  const started: Prisma.CouponWhereInput = { OR: [{ startsAt: null }, { startsAt: { lte: now } }] };
  const notEnded: Prisma.CouponWhereInput = { OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  // The same order as discountStatus (and checkout): off, not started, ended, used up.
  switch (status) {
    case "disabled":
      return { isActive: false };
    case "scheduled":
      return { isActive: true, startsAt: { gt: now } };
    case "expired":
      return { isActive: true, AND: [started, { endsAt: { lte: now } }] };
    case "used_up":
      return {
        isActive: true,
        AND: [started, notEnded, { usageLimit: { not: null } }, { usageCount: { gte: fields.usageLimit } }],
      };
    case "active":
      return {
        isActive: true,
        AND: [started, notEnded, { OR: [{ usageLimit: null }, { usageCount: { lt: fields.usageLimit } }] }],
      };
  }
}

function listOrder(params: ListParams): Prisma.CouponOrderByWithRelationInput[] {
  const dir = params.dir;
  switch (params.sort) {
    case "code":
      return [{ code: dir }];
    case "uses":
      return [{ usageCount: dir }, { createdAt: "desc" }, { id: "desc" }];
    case "ends":
      // Codes with no end date sit after every dated one, whichever way.
      return [{ endsAt: { sort: dir, nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }];
    default:
      return [{ createdAt: dir }, { id: dir }];
  }
}

function isDiscountStatus(value: string | undefined): value is DiscountStatus {
  return (DISCOUNT_STATUSES as readonly string[]).includes(value ?? "");
}

/** One page of codes for /admin/discounts: search by code or description, filter by status. */
export async function listDiscounts(
  params: ListParams,
  now: Date,
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: DiscountListRow[]; total: number; page: number }> {
  const db = getDb();
  const conditions: Prisma.CouponWhereInput[] = [];
  if (params.q) {
    const compact = params.q.replace(/\s+/g, "");
    conditions.push({
      OR: [
        { code: { contains: compact, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
      ],
    });
  }
  const status = params.filters.status;
  if (isDiscountStatus(status)) conditions.push(statusWhere(status, now));
  const where: Prisma.CouponWhereInput = conditions.length > 0 ? { AND: conditions } : {};

  const total = await db.coupon.count({ where });
  const page = Math.min(params.page, lastPage(total, pageSize));
  const coupons = await db.coupon.findMany({
    where,
    orderBy: listOrder(params),
    skip: pageOffset(page, pageSize),
    take: pageSize,
    select: listSelect,
  });

  return {
    total,
    page,
    rows: coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
      minSubtotal: coupon.minSubtotal,
      maxDiscount: coupon.maxDiscount,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      usageLimit: coupon.usageLimit,
      usageCount: coupon.usageCount,
      perCustomerLimit: coupon.perCustomerLimit,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt,
      categoryNames: coupon.categories.map((link) => link.category.name).sort(compareNames),
      productNames: coupon.products.map((link) => link.product.name).sort(compareNames),
    })),
  };
}

/** How many codes are in each status right now (the list's summary line). */
export async function getDiscountStatusCounts(now: Date): Promise<Record<DiscountStatus, number>> {
  const coupons = await getDb().coupon.findMany({
    select: { isActive: true, startsAt: true, endsAt: true, usageLimit: true, usageCount: true },
    take: 10_000,
  });
  const counts = Object.fromEntries(DISCOUNT_STATUSES.map((status) => [status, 0])) as Record<DiscountStatus, number>;
  for (const coupon of coupons) counts[discountStatus(coupon, now)] += 1;
  return counts;
}

export interface DiscountDetail extends Omit<DiscountListRow, "categoryNames" | "productNames"> {
  updatedAt: Date;
  /** Orders ever placed with it, cancelled checkouts included: any at all and it can't be deleted. */
  orderCount: number;
  categories: { id: string; name: string }[];
  products: { id: string; name: string; status: ProductStatus }[];
}

/** One code with what it's limited to; null when there's no such code. Shared by the page and its title. */
export const getDiscount = cache(async (id: string): Promise<DiscountDetail | null> => {
  const coupon = await getDb().coupon.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      description: true,
      type: true,
      value: true,
      minSubtotal: true,
      maxDiscount: true,
      startsAt: true,
      endsAt: true,
      usageLimit: true,
      usageCount: true,
      perCustomerLimit: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      categories: { select: { category: { select: { id: true, name: true } } } },
      products: { select: { product: { select: { id: true, name: true, status: true } } } },
      _count: { select: { orders: true } },
    },
  });
  if (!coupon) return null;
  const { categories, products, _count, ...rest } = coupon;
  return {
    ...rest,
    orderCount: _count.orders,
    categories: categories.map((link) => link.category).sort((a, b) => compareNames(a.name, b.name)),
    products: products.map((link) => link.product).sort((a, b) => compareNames(a.name, b.name)),
  };
});

export interface DiscountUsageSummary {
  /** Every order placed with the code, including cancelled checkouts. */
  orders: number;
  /** Orders still awaiting payment: each holds one of the code's uses until it's paid or released. */
  awaitingPayment: number;
  /** Paid and going ahead, not counting Paystack test payments. */
  paidOrders: number;
  /** Total taken off those paid orders (kobo). */
  discountGiven: number;
  /** What those paid orders came to after the discount (kobo). */
  paidSales: number;
  /** Paid orders made with Paystack test keys (left out of the figures above). */
  testOrders: number;
}

const testPayment: Prisma.PaymentListRelationFilter = { some: { status: "SUCCESS", isTest: true } };

/** The code's orders in figures, for its detail page. */
export async function getDiscountUsageSummary(couponId: string): Promise<DiscountUsageSummary> {
  const db = getDb();
  const [orders, awaitingPayment, paid, testOrders] = await Promise.all([
    db.order.count({ where: { couponId } }),
    db.couponUsage.count({ where: { couponId, order: { status: "PENDING" } } }),
    db.order.aggregate({
      where: { couponId, status: { in: PAID_ORDER_STATUSES }, NOT: { payments: testPayment } },
      _count: { _all: true },
      _sum: { discountTotal: true, total: true },
    }),
    db.order.count({ where: { couponId, status: { in: PAID_ORDER_STATUSES }, payments: testPayment } }),
  ]);
  return {
    orders,
    awaitingPayment,
    paidOrders: paid._count._all,
    discountGiven: paid._sum.discountTotal ?? 0,
    paidSales: paid._sum.total ?? 0,
    testOrders,
  };
}

export interface DiscountOrderRow {
  id: string;
  number: string;
  email: string;
  customerName: string;
  discountTotal: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  reservedUntil: Date | null;
  createdAt: Date;
  /** Paid with Paystack test keys: no real money moved. */
  isTest: boolean;
}

/** Orders placed with the code, newest first, one page at a time. */
export async function listDiscountOrders(
  couponId: string,
  requestedPage: number,
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: DiscountOrderRow[]; total: number; page: number }> {
  const db = getDb();
  const where: Prisma.OrderWhereInput = { couponId };
  const total = await db.order.count({ where });
  const page = Math.min(requestedPage, lastPage(total, pageSize));
  const orders = await db.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: pageOffset(page, pageSize),
    take: pageSize,
    select: {
      id: true,
      number: true,
      email: true,
      customerName: true,
      discountTotal: true,
      total: true,
      status: true,
      paymentStatus: true,
      reservedUntil: true,
      createdAt: true,
      payments: { where: { status: "SUCCESS", isTest: true }, select: { id: true }, take: 1 },
    },
  });
  return {
    total,
    page,
    rows: orders.map(({ payments, ...order }) => ({ ...order, isTest: payments.length > 0 })),
  };
}

export interface RestrictionOption {
  id: string;
  name: string;
  /** A quiet second line: the product's category and code. */
  detail?: string;
  /** "Draft" or "Archived" for products customers can't buy. */
  note?: string;
}

const PRODUCT_NOTES: Partial<Record<ProductStatus, string>> = { DRAFT: "Draft", ARCHIVED: "Archived" };

/** Every category and product a code can be limited to, for the form's pickers. */
export async function getRestrictionOptions(): Promise<{ categories: RestrictionOption[]; products: RestrictionOption[] }> {
  const db = getDb();
  const [categories, products] = await Promise.all([
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.product.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 2_000,
      select: { id: true, name: true, code: true, status: true, category: { select: { name: true } } },
    }),
  ]);
  return {
    categories: categories.map((category) => ({ id: category.id, name: category.name })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      detail: `${product.category.name} · ${product.code}`,
      note: PRODUCT_NOTES[product.status],
    })),
  };
}

/* ── Writing ────────────────────────────────────────────────────────────── */

export type DiscountWriteFailure =
  | "code_taken"
  | "not_found"
  | "restriction_missing"
  | "below_uses"
  | "in_use"
  | "needs_migration";

export type DiscountWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: DiscountWriteFailure; /** below_uses: uses so far; in_use: orders placed with it. */ count?: number };

/** Known database refusals, as a reason to explain to the owner; null for anything unexpected. */
function writeFailure(error: unknown): DiscountWriteFailure | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (error.code) {
    case "P2002":
      return "code_taken"; // Coupon.code is the table's only unique field an admin sets.
    case "P2003":
      return "restriction_missing"; // A chosen category or product was deleted meanwhile.
    case "P2021":
    case "P2022":
      return "needs_migration"; // AuditLog doesn't exist until `npm run db:deploy`.
    case "P2025":
      return "not_found";
    default:
      return null;
  }
}

async function runWrite<T>(write: () => Promise<DiscountWriteResult<T>>): Promise<DiscountWriteResult<T>> {
  try {
    return await write();
  } catch (error) {
    const reason = writeFailure(error);
    if (reason) return { ok: false, reason };
    throw error;
  }
}

type Tx = Prisma.TransactionClient;

/** The chosen categories and products, by name — or null when any of them no longer exists. */
async function restrictionNames(
  tx: Tx,
  input: Pick<DiscountInput, "categoryIds" | "productIds">,
): Promise<{ categoryNames: string[]; productNames: string[] } | null> {
  const [categories, products] = await Promise.all([
    input.categoryIds.length > 0
      ? tx.category.findMany({ where: { id: { in: input.categoryIds } }, select: { name: true } })
      : Promise.resolve([]),
    input.productIds.length > 0
      ? tx.product.findMany({ where: { id: { in: input.productIds } }, select: { name: true } })
      : Promise.resolve([]),
  ]);
  if (categories.length !== input.categoryIds.length || products.length !== input.productIds.length) return null;
  return {
    categoryNames: categories.map((category) => category.name).sort(compareNames),
    productNames: products.map((product) => product.name).sort(compareNames),
  };
}

/** The stored fields the form edits (everything but the switch and the counters). */
function couponFields(input: DiscountInput) {
  return {
    code: input.code,
    description: input.description,
    type: input.type,
    value: input.value,
    minSubtotal: input.minSubtotal,
    maxDiscount: input.type === "PERCENTAGE" ? input.maxDiscount : null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: input.usageLimit,
    perCustomerLimit: input.perCustomerLimit,
  } satisfies Prisma.CouponUncheckedUpdateInput;
}

function snapshotOf(input: DiscountInput): DiscountSnapshot {
  return {
    ...couponFields(input),
    categoryIds: input.categoryIds,
    productIds: input.productIds,
  };
}

/** A snapshot for the audit entry's metadata (dates as ISO strings). */
function auditSnapshot(snapshot: DiscountSnapshot & { isActive?: boolean }): Prisma.InputJsonObject {
  return {
    code: snapshot.code,
    type: snapshot.type,
    value: snapshot.value,
    minSubtotal: snapshot.minSubtotal,
    maxDiscount: snapshot.maxDiscount,
    startsAt: snapshot.startsAt?.toISOString() ?? null,
    endsAt: snapshot.endsAt?.toISOString() ?? null,
    usageLimit: snapshot.usageLimit,
    perCustomerLimit: snapshot.perCustomerLimit,
    categoryIds: [...snapshot.categoryIds],
    productIds: [...snapshot.productIds],
    ...(snapshot.isActive !== undefined ? { isActive: snapshot.isActive } : {}),
  };
}

/** Creates a code. Fails with code_taken or restriction_missing rather than throwing. */
export async function createDiscount(
  input: DiscountInput,
  actorId: string,
): Promise<DiscountWriteResult<{ id: string; code: string }>> {
  return runWrite(() =>
    getDb().$transaction(async (tx): Promise<DiscountWriteResult<{ id: string; code: string }>> => {
      const names = await restrictionNames(tx, input);
      if (!names) return { ok: false, reason: "restriction_missing" };

      const created = await tx.coupon.create({
        data: {
          ...couponFields(input),
          isActive: input.isActive,
          categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
          products: { create: input.productIds.map((productId) => ({ productId })) },
        },
        select: { id: true, code: true },
      });

      await recordAudit({
        tx,
        actorId,
        action: "coupon.create",
        entityType: "Coupon",
        entityId: created.id,
        summary: `Created discount ${created.code}: ${describeDiscountRule({ ...input, ...names })}${input.isActive ? "" : " (switched off)"}.`,
        metadata: { after: auditSnapshot({ ...snapshotOf(input), isActive: input.isActive }) },
      });
      return { ok: true, data: created };
    }, TRANSACTION),
  );
}

/** Same ids, in any order (both lists are free of duplicates). */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return a.length === b.length && b.every((id) => set.has(id));
}

/** Locks one code's row for the rest of the transaction; null when it doesn't exist. */
async function lockCoupon(tx: Tx, id: string): Promise<{ id: string; code: string; usageCount: number } | null> {
  const rows = await tx.$queryRaw<{ id: string; code: string; usageCount: number }[]>`
    SELECT "id", "code", "usageCount" FROM "Coupon" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Saves the form's fields over a code (not its on/off switch or counters).
 * Returns what changed, in words; an unchanged save writes nothing.
 */
export interface DiscountUpdate {
  code: string;
  /** The code before this save (differs from `code` when it was renamed). */
  previousCode: string;
  changes: string[];
  /** The amount off, its minimum, cap or what it covers changed. */
  amountChanged: boolean;
  /** Uses at the moment of the save. */
  usesSoFar: number;
}

export async function updateDiscount(
  id: string,
  input: DiscountInput,
  actorId: string,
): Promise<DiscountWriteResult<DiscountUpdate>> {
  return runWrite(() =>
    getDb().$transaction(async (tx): Promise<DiscountWriteResult<DiscountUpdate>> => {
      const locked = await lockCoupon(tx, id);
      if (!locked) return { ok: false, reason: "not_found" };
      // Checked again under the lock: an order may have used the code since the form was read.
      if (input.usageLimit !== null && input.usageLimit < locked.usageCount) {
        return { ok: false, reason: "below_uses", count: locked.usageCount };
      }

      const stored = await tx.coupon.findUniqueOrThrow({
        where: { id },
        select: {
          code: true,
          description: true,
          type: true,
          value: true,
          minSubtotal: true,
          maxDiscount: true,
          startsAt: true,
          endsAt: true,
          usageLimit: true,
          perCustomerLimit: true,
          categories: { select: { categoryId: true } },
          products: { select: { productId: true } },
        },
      });
      const before: DiscountSnapshot = {
        ...stored,
        categoryIds: stored.categories.map((link) => link.categoryId),
        productIds: stored.products.map((link) => link.productId),
      };
      const after = snapshotOf(input);
      const changes = describeDiscountChanges(before, after);
      const update: DiscountUpdate = {
        code: input.code,
        previousCode: stored.code,
        changes,
        amountChanged: changesDiscountAmount(before, after),
        usesSoFar: locked.usageCount,
      };
      if (changes.length === 0) return { ok: true, data: update };

      const names = await restrictionNames(tx, input);
      if (!names) return { ok: false, reason: "restriction_missing" };

      await tx.coupon.update({ where: { id }, data: couponFields(input), select: { id: true } });

      if (!sameIds(before.categoryIds, after.categoryIds)) {
        await tx.couponCategory.deleteMany({ where: { couponId: id } });
        if (input.categoryIds.length > 0) {
          await tx.couponCategory.createMany({ data: input.categoryIds.map((categoryId) => ({ couponId: id, categoryId })) });
        }
      }
      if (!sameIds(before.productIds, after.productIds)) {
        await tx.couponProduct.deleteMany({ where: { couponId: id } });
        if (input.productIds.length > 0) {
          await tx.couponProduct.createMany({ data: input.productIds.map((productId) => ({ couponId: id, productId })) });
        }
      }

      await recordAudit({
        tx,
        actorId,
        action: "coupon.update",
        entityType: "Coupon",
        entityId: id,
        summary: `Changed discount ${input.code}: ${changes.join("; ")}.`,
        metadata: { changes, before: auditSnapshot(before), after: auditSnapshot(after), usesSoFar: locked.usageCount },
      });
      return { ok: true, data: update };
    }, TRANSACTION),
  );
}

/**
 * Switches a code on or off, only if it isn't already (a conditional update, so
 * two admins can't record the same change twice). `changed` is false when it
 * already was.
 */
export async function setDiscountActive(
  id: string,
  active: boolean,
  actorId: string,
): Promise<DiscountWriteResult<{ code: string; isActive: boolean; changed: boolean }>> {
  return runWrite(() =>
    getDb().$transaction(async (tx): Promise<DiscountWriteResult<{ code: string; isActive: boolean; changed: boolean }>> => {
      const switched = await tx.coupon.updateMany({ where: { id, isActive: !active }, data: { isActive: active } });
      const coupon = await tx.coupon.findUnique({ where: { id }, select: { code: true, isActive: true } });
      if (!coupon) return { ok: false, reason: "not_found" };
      if (switched.count === 0) return { ok: true, data: { code: coupon.code, isActive: coupon.isActive, changed: false } };

      await recordAudit({
        tx,
        actorId,
        action: active ? "coupon.enable" : "coupon.disable",
        entityType: "Coupon",
        entityId: id,
        summary: `Switched ${active ? "on" : "off"} discount ${coupon.code}.`,
      });
      return { ok: true, data: { code: coupon.code, isActive: active, changed: true } };
    }, TRANSACTION),
  );
}

/**
 * Deletes a code that no order has ever used. Checked under the row lock, so an
 * order being placed with it at that moment either finishes first (and the
 * delete is refused) or finds the code gone.
 */
export async function deleteDiscount(id: string, actorId: string): Promise<DiscountWriteResult<{ code: string }>> {
  return runWrite(() =>
    getDb().$transaction(async (tx): Promise<DiscountWriteResult<{ code: string }>> => {
      const locked = await lockCoupon(tx, id);
      if (!locked) return { ok: false, reason: "not_found" };

      const [orders, usages] = await Promise.all([
        tx.order.count({ where: { couponId: id } }),
        tx.couponUsage.count({ where: { couponId: id } }),
      ]);
      if (orders > 0 || usages > 0 || locked.usageCount > 0) {
        return { ok: false, reason: "in_use", count: Math.max(orders, usages, locked.usageCount) };
      }

      await tx.coupon.delete({ where: { id }, select: { id: true } });
      await recordAudit({
        tx,
        actorId,
        action: "coupon.delete",
        entityType: "Coupon",
        entityId: id,
        summary: `Deleted discount ${locked.code}, which had never been used.`,
      });
      return { ok: true, data: { code: locked.code } };
    }, TRANSACTION),
  );
}

/**
 * Copies a code's rules, dates, limits and restrictions under a new code. The
 * copy starts switched off with no uses, so it can be checked before customers
 * can use it.
 */
export async function duplicateDiscount(
  sourceId: string,
  code: string,
  actorId: string,
): Promise<DiscountWriteResult<{ id: string; code: string; sourceCode: string }>> {
  return runWrite(() =>
    getDb().$transaction(async (tx): Promise<DiscountWriteResult<{ id: string; code: string; sourceCode: string }>> => {
      const source = await tx.coupon.findUnique({
        where: { id: sourceId },
        select: {
          code: true,
          description: true,
          type: true,
          value: true,
          minSubtotal: true,
          maxDiscount: true,
          startsAt: true,
          endsAt: true,
          usageLimit: true,
          perCustomerLimit: true,
          categories: { select: { categoryId: true } },
          products: { select: { productId: true } },
        },
      });
      if (!source) return { ok: false, reason: "not_found" };

      const { categories, products, code: sourceCode, ...fields } = source;
      const created = await tx.coupon.create({
        data: {
          ...fields,
          code,
          isActive: false,
          categories: { create: categories.map((link) => ({ categoryId: link.categoryId })) },
          products: { create: products.map((link) => ({ productId: link.productId })) },
        },
        select: { id: true, code: true },
      });

      await recordAudit({
        tx,
        actorId,
        action: "coupon.duplicate",
        entityType: "Coupon",
        entityId: created.id,
        summary: `Copied discount ${sourceCode} as ${created.code} (switched off).`,
        metadata: { sourceId, sourceCode },
      });
      return { ok: true, data: { id: created.id, code: created.code, sourceCode } };
    }, TRANSACTION),
  );
}
