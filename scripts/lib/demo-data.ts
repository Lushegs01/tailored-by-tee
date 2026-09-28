/*
 * Shared machinery for the two demo-store scripts (seed-demo.ts, clear-demo.ts).
 *
 * The plans themselves — customers, orders, reviews, timings, money — are pure and
 * live in src/lib/admin/demo-fixtures.ts, where they are covered by tests. This
 * file is the part that needs a database: reading the real catalogue, turning a
 * plan into rows, and taking every demo row back out again.
 *
 * ⚠ This project uses ONE Neon database for development and production. Nothing
 * here writes unless the caller passed --yes, both scripts print the database host
 * first, and every row written is marked (isDemo / isTest) so clear-demo can find
 * exactly what seed-demo created and nothing else.
 */
import nextEnv from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";

import type { Prisma } from "../../src/generated/prisma/client";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  DEMO_CARRIERS,
  DEMO_CUSTOMERS,
  DEMO_ORDER_PLAN,
  DEMO_REVIEWS,
  chooseDemoLines,
  createDemoRandom,
  demoAddressId,
  demoCouponUsageId,
  demoCustomer,
  demoEmail,
  demoOrderEvents,
  demoOrderId,
  demoOrderItemId,
  demoOrderNumber,
  demoOrderTotals,
  demoOrderWasPaid,
  demoPaymentId,
  demoPaymentReference,
  demoPaymentStatus,
  demoRefundAmount,
  demoRefundId,
  demoReviewId,
  demoTimeline,
  demoTrackingNumber,
  demoUserId,
  isDemoOrderNumber,
  lagosCalendarParts,
  lagosDaysAgo,
  type DemoOrderSpec,
} from "../../src/lib/admin/demo-fixtures";
import { evaluateCoupon, type CouponRule } from "../../src/lib/commerce/discounts";

export type Tx = Prisma.TransactionClient;

/* ── Command line ───────────────────────────────────────────────────────── */

/** A problem the person running the script can fix; printed without a stack trace. */
export class DemoScriptError extends Error {}

export interface DemoFlags {
  confirmed: boolean;
  allowProduction: boolean;
  help: boolean;
}

/**
 * Reads --yes, --allow-production and --help. Anything else is a mistake worth
 * stopping for: a mistyped flag must never be read as "go ahead".
 */
export function readDemoFlags(argv: string[], allowed: readonly string[]): DemoFlags {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 0) throw new DemoScriptError(`This script takes no arguments, only flags. Remove: ${positional.join(", ")}`);

  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const known = new Set(["--help", ...allowed]);
  const unknown = [...flags].filter((flag) => !known.has(flag));
  if (unknown.length > 0) throw new DemoScriptError(`Unknown option: ${unknown.join(", ")}`);

  return {
    confirmed: flags.has("--yes"),
    allowProduction: flags.has("--allow-production"),
    help: flags.has("--help"),
  };
}

/** Environment files load exactly as Next.js loads them, so one .env.local serves everything. */
export function loadEnvironment(): void {
  // @next/env is CommonJS without named-export hints, so it is read from the default export.
  nextEnv.loadEnvConfig(process.cwd());
}

export function readConnectionString(): string {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DemoScriptError("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) in .env.local first — see .env.example.");
  }
  return connectionString;
}

/** Only the host, e.g. "ep-quiet-sun-123.eu-central-1.aws.neon.tech" — never credentials or the full URL. */
export function databaseHost(connectionString: string): string {
  try {
    return new URL(connectionString).hostname || "(unknown host)";
  } catch {
    return "(unreadable connection string)";
  }
}

export function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

/* ── Removing the demo store ────────────────────────────────────────────── */

export interface DemoDeletionCounts {
  reviews: number;
  couponUsages: number;
  refunds: number;
  orderEvents: number;
  payments: number;
  orderItems: number;
  stockAdjustments: number;
  orders: number;
  wishlistItems: number;
  wishlists: number;
  cartItems: number;
  carts: number;
  addresses: number;
  sessions: number;
  accounts: number;
  users: number;
}

export interface DemoDeletionResult {
  counts: DemoDeletionCounts;
  /** Rows that carry the demo mark but don't look like ours; left alone and reported. */
  skipped: string[];
}

export const EMPTY_DELETION_COUNTS: DemoDeletionCounts = {
  reviews: 0,
  couponUsages: 0,
  refunds: 0,
  orderEvents: 0,
  payments: 0,
  orderItems: 0,
  stockAdjustments: 0,
  orders: 0,
  wishlistItems: 0,
  wishlists: 0,
  cartItems: 0,
  carts: 0,
  addresses: 0,
  sessions: 0,
  accounts: 0,
  users: 0,
};

/**
 * Deletes every demo row and nothing else, in dependency order inside the caller's
 * transaction. Each step is keyed on the demo mark (Order.isDemo, Review.isDemo,
 * User.isDemo), and two extra rails protect the live store:
 *
 * - an order marked demo whose number isn't a DEMO- number is left alone, because
 *   something unexpected made it and a person should look first;
 * - a demo account that has since been given admin access is left alone, so
 *   clearing the demo store can never lock the owner out of /admin.
 */
export async function deleteDemoData(tx: Tx): Promise<DemoDeletionResult> {
  const counts: DemoDeletionCounts = { ...EMPTY_DELETION_COUNTS };
  const skipped: string[] = [];

  // Reviews first: Review.orderId is "set null" on delete, so clearing orders
  // first would quietly detach a demo review from its demo order.
  counts.reviews = (await tx.review.deleteMany({ where: { isDemo: true } })).count;

  const marked = await tx.order.findMany({ where: { isDemo: true }, select: { id: true, number: true } });
  const orderIds: string[] = [];
  for (const order of marked) {
    if (isDemoOrderNumber(order.number)) orderIds.push(order.id);
    else skipped.push(`Order ${order.number} is marked as demo but isn't numbered like one — left alone.`);
  }

  if (orderIds.length > 0) {
    const where = { orderId: { in: orderIds } };
    counts.couponUsages = (await tx.couponUsage.deleteMany({ where })).count;
    counts.refunds = (await tx.refund.deleteMany({ where })).count;
    counts.orderEvents = (await tx.orderEvent.deleteMany({ where })).count;
    counts.payments = (await tx.payment.deleteMany({ where })).count;
    counts.orderItems = (await tx.orderItem.deleteMany({ where })).count;
    // Demo orders never move stock, so this should always be 0; it is here in case
    // a future change adds one, since such a row could only ever be demo.
    counts.stockAdjustments = (await tx.inventoryAdjustment.deleteMany({ where })).count;
    counts.orders = (await tx.order.deleteMany({ where: { id: { in: orderIds } } })).count;
  }

  const demoUsers = await tx.user.findMany({ where: { isDemo: true }, select: { id: true, email: true, role: true } });
  const userIds: string[] = [];
  for (const user of demoUsers) {
    if (user.role === "ADMIN") {
      skipped.push(`${user.email} is a demo account that now has admin access — left alone.`);
    } else {
      userIds.push(user.id);
    }
  }

  if (userIds.length > 0) {
    const owned = { userId: { in: userIds } };
    counts.wishlistItems = (await tx.wishlistItem.deleteMany({ where: { wishlist: { is: owned } } })).count;
    counts.wishlists = (await tx.wishlist.deleteMany({ where: owned })).count;
    counts.cartItems = (await tx.cartItem.deleteMany({ where: { cart: { is: owned } } })).count;
    counts.carts = (await tx.cart.deleteMany({ where: owned })).count;
    counts.addresses = (await tx.address.deleteMany({ where: owned })).count;
    counts.sessions = (await tx.session.deleteMany({ where: owned })).count;
    counts.accounts = (await tx.account.deleteMany({ where: owned })).count;
    // Any usage row still pointing at a demo account belongs to a demo order we
    // couldn't delete; clear it so the account itself can go.
    counts.couponUsages += (await tx.couponUsage.deleteMany({ where: owned })).count;
    counts.users = (await tx.user.deleteMany({ where: { id: { in: userIds }, isDemo: true } })).count;
  }

  return { counts, skipped };
}

export function totalDeleted(counts: DemoDeletionCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

/* ── Reading the real catalogue ─────────────────────────────────────────── */

export interface DemoVariant {
  id: string;
  sku: string;
  colorId: string;
  colorName: string;
  sizeLabel: string;
  /** Integer kobo, the variant's own price when it has one. */
  unitPrice: number;
  compareAtUnitPrice: number | null;
  imageUrl: string | null;
  productId: string;
  productName: string;
  productSlug: string;
  categoryId: string;
}

export interface DemoCatalogue {
  variants: DemoVariant[];
  /** Live products, for reviews and wishlists. */
  products: { id: string; name: string }[];
  /** A real, usable discount code if the shop has one — demo orders never invent codes. */
  coupon: CouponRule | null;
}

/** The storefront's own rule: the main photo for this colour, else one for every colour. */
function imageForColor(
  images: { role: string; colorId: string | null; media: { url: string } }[],
  colorId: string,
  firstColorId: string | null,
): string | null {
  const primary = images.filter((image) => image.role === "PRIMARY");
  const chosen =
    primary.find((image) => image.colorId === colorId) ??
    primary.find((image) => image.colorId === null || image.colorId === firstColorId) ??
    primary[0] ??
    null;
  return chosen?.media.url ?? null;
}

export async function loadDemoCatalogue(db: PrismaClient): Promise<DemoCatalogue> {
  const [variants, products, coupons] = await Promise.all([
    db.productVariant.findMany({
      where: { isActive: true, product: { status: "ACTIVE" } },
      orderBy: { sku: "asc" },
      select: {
        id: true,
        sku: true,
        colorId: true,
        priceOverride: true,
        color: { select: { name: true } },
        size: { select: { label: true } },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            categoryId: true,
            colors: { orderBy: { position: "asc" }, take: 1, select: { colorId: true } },
            images: {
              orderBy: { position: "asc" },
              select: { role: true, colorId: true, media: { select: { url: true } } },
            },
          },
        },
      },
    }),
    db.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.coupon.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      take: 10,
      include: { categories: { select: { categoryId: true } }, products: { select: { productId: true } } },
    }),
  ]);

  const mapped = variants
    .map((variant): DemoVariant => {
      const product = variant.product;
      return {
        id: variant.id,
        sku: variant.sku,
        colorId: variant.colorId,
        colorName: variant.color.name,
        sizeLabel: variant.size.label,
        unitPrice: variant.priceOverride ?? product.price,
        compareAtUnitPrice: product.compareAtPrice,
        imageUrl: imageForColor(product.images, variant.colorId, product.colors[0]?.colorId ?? null),
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        categoryId: product.categoryId,
      };
    })
    // A free line would break the "payments are for more than nothing" rule the
    // database enforces, and tells the owner nothing useful.
    .filter((variant) => variant.unitPrice > 0);

  // Photographed pieces first, so demo orders look like the shop does.
  mapped.sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) || a.sku.localeCompare(b.sku));

  const rules: CouponRule[] = coupons.map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    type: coupon.type === "PERCENTAGE" ? "percentage" : "fixed",
    value: coupon.value,
    minSubtotal: coupon.minSubtotal,
    maxDiscount: coupon.maxDiscount,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    usageLimit: coupon.usageLimit,
    usageCount: coupon.usageCount,
    perCustomerLimit: coupon.perCustomerLimit,
    isActive: coupon.isActive,
    categoryIds: coupon.categories.map((link) => link.categoryId),
    productIds: coupon.products.map((link) => link.productId),
  }));

  return { variants: mapped, products, coupon: rules[0] ?? null };
}

/* ── Writing the demo store ─────────────────────────────────────────────── */

export interface SeedCounts {
  users: number;
  addresses: number;
  wishlists: number;
  orders: number;
  orderItems: number;
  payments: number;
  orderEvents: number;
  refunds: number;
  couponUsages: number;
  reviews: number;
  /** Orders that ended up carrying the shop's discount code. */
  discountedOrders: number;
}

/** Emails a non-demo account already holds; seeding would collide with them. */
export async function findConflictingEmails(db: PrismaClient): Promise<string[]> {
  const emails = DEMO_CUSTOMERS.filter((customer) => customer.registered).map((customer) => demoEmail(customer.key));
  const clashes = await db.user.findMany({
    where: { email: { in: emails }, isDemo: false },
    select: { email: true },
  });
  return clashes.map((row) => row.email);
}

/** Order numbers in the DEMO- range that a real order already holds. */
export async function findConflictingOrderNumbers(db: PrismaClient, year: number): Promise<string[]> {
  const numbers = DEMO_ORDER_PLAN.map((spec) => demoOrderNumber(year, spec.sequence));
  const clashes = await db.order.findMany({
    where: { number: { in: numbers }, isDemo: false },
    select: { number: true },
  });
  return clashes.map((row) => row.number);
}

async function seedCustomers(tx: Tx, now: Date, products: { id: string }[]): Promise<Pick<SeedCounts, "users" | "addresses" | "wishlists">> {
  let users = 0;
  let addresses = 0;
  let wishlists = 0;

  for (const [index, customer] of DEMO_CUSTOMERS.entries()) {
    if (!customer.registered) continue;

    const id = demoUserId(customer.key);
    const joinedAt = lagosDaysAgo(now, 60 - index * 3, 10, index * 5);
    await tx.user.create({
      data: {
        id,
        email: demoEmail(customer.key),
        emailVerified: joinedAt,
        name: customer.name,
        phone: customer.phone,
        role: "CUSTOMER",
        isDemo: true,
        createdAt: joinedAt,
        updatedAt: joinedAt,
      },
      select: { id: true },
    });
    users += 1;

    await tx.address.create({
      data: {
        id: demoAddressId(customer.key),
        userId: id,
        label: "Home",
        fullName: customer.name,
        phone: customer.phone,
        line1: customer.address.line1,
        line2: customer.address.line2,
        city: customer.address.city,
        state: customer.address.state,
        postalCode: customer.address.postalCode,
        country: "NG",
        isDefault: true,
        createdAt: joinedAt,
        updatedAt: joinedAt,
      },
      select: { id: true },
    });
    addresses += 1;

    const saved = products.slice(index, index + 2);
    if (saved.length > 0) {
      await tx.wishlist.create({
        data: {
          userId: id,
          createdAt: joinedAt,
          updatedAt: joinedAt,
          items: { create: saved.map((product) => ({ productId: product.id, addedAt: joinedAt })) },
        },
        select: { id: true },
      });
      wishlists += 1;
    }
  }

  return { users, addresses, wishlists };
}

interface BuiltLine {
  variant: DemoVariant;
  quantity: number;
  lineTotal: number;
}

function buildLines(spec: DemoOrderSpec, variants: readonly DemoVariant[], year: number): BuiltLine[] {
  const random = createDemoRandom(year * 1_000 + spec.sequence);
  return chooseDemoLines(random, variants, spec.lines, 2).map(({ item, quantity }) => ({
    variant: item,
    quantity,
    lineTotal: item.unitPrice * quantity,
  }));
}

async function seedOrder(
  tx: Tx,
  spec: DemoOrderSpec,
  context: { now: Date; year: number; catalogue: DemoCatalogue },
): Promise<{ items: number; payments: number; events: number; refunds: number; couponUsages: number; discounted: boolean }> {
  const { now, year, catalogue } = context;
  const customer = demoCustomer(spec.customer);
  const number = demoOrderNumber(year, spec.sequence);
  const orderId = demoOrderId(year, spec.sequence);
  const lines = buildLines(spec, catalogue.variants, year);
  const timeline = demoTimeline(now, spec);
  const email = demoEmail(customer.key);

  // The shop's own discount rules decide the amount — the demo store never invents one.
  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (spec.withDiscount && catalogue.coupon) {
    const result = evaluateCoupon(catalogue.coupon, catalogue.coupon.code, {
      now: timeline.placedAt,
      lines: lines.map((line) => ({
        productId: line.variant.productId,
        categoryId: line.variant.categoryId,
        lineTotal: line.lineTotal,
      })),
      customerUses: 0,
    });
    if (result.ok) {
      discount = result.discount;
      couponId = result.couponId;
      couponCode = result.code;
    }
  }

  const isDelivery = spec.delivery === "delivery";
  const lineTotals = lines.map((line) => line.lineTotal);
  const stateCode = isDelivery ? customer.address.state : null;
  let money = demoOrderTotals({ lineTotals, discount, method: spec.delivery, stateCode });

  // The database insists a payment is for more than nothing, so a code that would
  // take the whole order to zero is simply not applied to this demo order.
  if (money.total <= 0) {
    discount = 0;
    couponId = null;
    couponCode = null;
    money = demoOrderTotals({ lineTotals, discount, method: spec.delivery, stateCode });
  }

  const paid = demoOrderWasPaid(spec);
  const reference = paid ? demoPaymentReference(number, spec.failedAttempt ? 2 : 1) : null;
  const carrier = timeline.shippedAt ? DEMO_CARRIERS[spec.sequence % DEMO_CARRIERS.length] : null;
  const trackingNumber = timeline.shippedAt ? demoTrackingNumber(year, spec.sequence) : null;
  const lastChange =
    timeline.refundedAt ?? timeline.cancelledAt ?? timeline.deliveredAt ?? timeline.shippedAt ?? timeline.paidAt ?? timeline.placedAt;

  const events = demoOrderEvents(spec, timeline, { orderNumber: number, reference, trackingNumber, carrier });

  await tx.order.create({
    data: {
      id: orderId,
      number,
      userId: customer.registered ? demoUserId(customer.key) : null,
      email,
      phone: customer.phone,
      customerName: customer.name,
      status: spec.status,
      paymentStatus: demoPaymentStatus(spec, timeline.holdLapsed),
      currency: "NGN",
      subtotal: money.subtotal,
      discountTotal: money.discountTotal,
      shippingTotal: money.shippingTotal,
      total: money.total,
      couponId,
      couponCode,
      deliveryMethod: isDelivery ? "DELIVERY" : "PICKUP",
      deliveryZone: money.delivery?.zoneId ?? null,
      deliveryEstimate: money.delivery?.estimate ?? null,
      shipFullName: isDelivery ? customer.name : null,
      shipPhone: isDelivery ? customer.phone : null,
      shipLine1: isDelivery ? customer.address.line1 : null,
      shipLine2: isDelivery ? customer.address.line2 : null,
      shipCity: isDelivery ? customer.address.city : null,
      shipState: isDelivery ? customer.address.state : null,
      shipPostalCode: isDelivery ? customer.address.postalCode : null,
      shipCountry: "NG",
      deliveryNotes: null,
      reservedUntil: timeline.reservedUntil,
      // No checkout key and no access token: a demo order was never placed from a
      // browser, and must never make a real checkout look like a repeat submission.
      checkoutKey: null,
      checkoutSession: null,
      accessTokenHash: null,
      paidAt: timeline.paidAt,
      cancelledAt: timeline.cancelledAt,
      shippedAt: timeline.shippedAt,
      deliveredAt: timeline.deliveredAt,
      refundedAt: timeline.refundedAt,
      trackingNumber,
      carrier,
      isDemo: true,
      createdAt: timeline.placedAt,
      updatedAt: lastChange,
      items: {
        create: lines.map((line, index) => ({
          id: demoOrderItemId(year, spec.sequence, index),
          variantId: line.variant.id,
          productId: line.variant.productId,
          productName: line.variant.productName,
          productSlug: line.variant.productSlug,
          sku: line.variant.sku,
          colorName: line.variant.colorName,
          sizeLabel: line.variant.sizeLabel,
          imageUrl: line.variant.imageUrl,
          unitPrice: line.variant.unitPrice,
          compareAtUnitPrice: line.variant.compareAtUnitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      },
      events: {
        create: events.map((event, index) => ({
          id: demoOrderEventId(year, spec.sequence, index),
          type: event.type,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          note: event.note,
          // Demo history was never the work of a real admin, so it names nobody.
          actorId: null,
          createdAt: event.createdAt,
        })),
      },
    },
    select: { id: true },
  });

  /*
   * Payments. Every demo payment is marked isTest, so it can never be counted as
   * real money — the same mark Paystack's test keys produce.
   */
  let payments = 0;
  if (spec.failedAttempt && timeline.failedPaymentAt) {
    await tx.payment.create({
      data: {
        id: demoPaymentId(year, spec.sequence, 1),
        orderId,
        provider: "paystack",
        reference: demoPaymentReference(number, 1),
        amount: money.total,
        currency: "NGN",
        status: "FAILED",
        channel: "card",
        gatewayResponse: "Declined by the bank",
        isTest: true,
        verifiedAt: timeline.failedPaymentAt,
        createdAt: timeline.failedPaymentAt,
        updatedAt: timeline.failedPaymentAt,
      },
      select: { id: true },
    });
    payments += 1;
  }

  const attempt = spec.failedAttempt ? 2 : 1;
  if (paid && timeline.paidAt) {
    await tx.payment.create({
      data: {
        id: demoPaymentId(year, spec.sequence, attempt),
        orderId,
        provider: "paystack",
        reference: demoPaymentReference(number, attempt),
        amount: money.total,
        currency: "NGN",
        status: spec.status === "REFUNDED" ? "REFUNDED" : "SUCCESS",
        channel: spec.sequence % 3 === 0 ? "bank_transfer" : "card",
        gatewayResponse: "Successful",
        providerTransactionId: `demo_${year}_${spec.sequence}`,
        isTest: true,
        paidAt: timeline.paidAt,
        verifiedAt: timeline.paidAt,
        createdAt: timeline.paidAt,
        updatedAt: timeline.refundedAt ?? timeline.paidAt,
      },
      select: { id: true },
    });
    payments += 1;
  } else if (!paid) {
    const abandoned = timeline.holdLapsed || spec.status === "CANCELLED";
    await tx.payment.create({
      data: {
        id: demoPaymentId(year, spec.sequence, 1),
        orderId,
        provider: "paystack",
        reference: demoPaymentReference(number, 1),
        amount: money.total,
        currency: "NGN",
        status: abandoned ? "ABANDONED" : "PENDING",
        channel: null,
        gatewayResponse: abandoned ? "Checkout was not completed" : null,
        isTest: true,
        createdAt: timeline.placedAt,
        updatedAt: timeline.cancelledAt ?? timeline.placedAt,
      },
      select: { id: true },
    });
    payments += 1;
  }

  let refunds = 0;
  if (spec.refund && paid && timeline.paidAt) {
    const at = timeline.refundedAt ?? timeline.cancelledAt ?? timeline.paidAt;
    await tx.refund.create({
      data: {
        id: demoRefundId(year, spec.sequence),
        orderId,
        paymentId: demoPaymentId(year, spec.sequence, attempt),
        amount: demoRefundAmount(spec, money.total, lines[0]?.lineTotal ?? money.total),
        status: spec.refund.status,
        providerReference: spec.refund.status === "PROCESSED" ? `DEMO-RF-${year}-${spec.sequence}` : null,
        reason: spec.refund.reason,
        // Demo orders never touched stock, so nothing went back into it.
        restocked: false,
        actorId: null,
        createdAt: at,
        updatedAt: at,
      },
      select: { id: true },
    });
    refunds += 1;
  }

  let couponUsages = 0;
  if (couponId) {
    await tx.couponUsage.create({
      data: {
        id: demoCouponUsageId(year, spec.sequence),
        couponId,
        orderId,
        userId: customer.registered ? demoUserId(customer.key) : null,
        email,
        createdAt: timeline.placedAt,
      },
      select: { id: true },
    });
    couponUsages += 1;
  }

  return { items: lines.length, payments, events: events.length, refunds, couponUsages, discounted: couponId !== null };
}

async function seedReviews(tx: Tx, now: Date, catalogue: DemoCatalogue, year: number): Promise<number> {
  if (catalogue.products.length === 0) return 0;

  // Verified reviews are attached to a delivered demo order the same customer placed.
  const deliveredByCustomer = new Map<string, string>();
  for (const spec of DEMO_ORDER_PLAN) {
    if (spec.status === "DELIVERED" && !deliveredByCustomer.has(spec.customer)) {
      deliveredByCustomer.set(spec.customer, demoOrderId(year, spec.sequence));
    }
  }

  let written = 0;
  for (const [index, review] of DEMO_REVIEWS.entries()) {
    const customer = demoCustomer(review.customer);
    const product = catalogue.products[index % catalogue.products.length];
    const writtenAt = lagosDaysAgo(now, review.daysAgo, 9 + (index % 10), (index * 7) % 60);
    const at = new Date(Math.min(writtenAt.getTime(), now.getTime() - 60_000));
    const moderated = review.status === "PENDING" ? null : new Date(at.getTime() + 3_600_000);

    await tx.review.create({
      data: {
        id: demoReviewId(review.key),
        productId: product.id,
        userId: customer.registered ? demoUserId(customer.key) : null,
        orderId: review.verified ? (deliveredByCustomer.get(review.customer) ?? null) : null,
        rating: review.rating,
        title: review.title,
        body: review.body,
        displayName: customer.name,
        isVerifiedPurchase: review.verified,
        status: review.status,
        isDemo: true,
        moderatedAt: moderated,
        // Nobody in the admin team moderated these; they arrived with the demo store.
        moderatedById: null,
        createdAt: at,
        updatedAt: moderated ?? at,
      },
      select: { id: true },
    });
    written += 1;
  }
  return written;
}

/**
 * Writes the whole demo store inside the caller's transaction: customers first,
 * then their orders with items, payments, timelines and refunds, then reviews.
 *
 * Stock is deliberately untouched. Demo sales never reserve, deduct or return a
 * single piece, so the shop's inventory stays true while the admin area is tried.
 */
export async function seedDemoData(tx: Tx, catalogue: DemoCatalogue, now: Date): Promise<SeedCounts> {
  const year = lagosCalendarParts(now).year;
  const counts: SeedCounts = {
    users: 0,
    addresses: 0,
    wishlists: 0,
    orders: 0,
    orderItems: 0,
    payments: 0,
    orderEvents: 0,
    refunds: 0,
    couponUsages: 0,
    reviews: 0,
    discountedOrders: 0,
  };

  const people = await seedCustomers(tx, now, catalogue.products);
  counts.users = people.users;
  counts.addresses = people.addresses;
  counts.wishlists = people.wishlists;

  for (const spec of DEMO_ORDER_PLAN) {
    const written = await seedOrder(tx, spec, { now, year, catalogue });
    counts.orders += 1;
    counts.orderItems += written.items;
    counts.payments += written.payments;
    counts.orderEvents += written.events;
    counts.refunds += written.refunds;
    counts.couponUsages += written.couponUsages;
    if (written.discounted) counts.discountedOrders += 1;
  }

  counts.reviews = await seedReviews(tx, now, catalogue, year);
  return counts;
}

export { DEMO_EMAIL_DOMAIN } from "../../src/lib/admin/demo-fixtures";
