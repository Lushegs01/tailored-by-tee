import "server-only";

import { createHash } from "node:crypto";

import { siteConfig } from "@/config/site";
import { Prisma } from "@/generated/prisma/client";
import { toDbEnum } from "@/lib/catalog/db-enums";
import { quoteCheckout } from "@/lib/commerce/checkout";
import type { CheckoutDetails } from "@/lib/commerce/checkout-schema";
import { normalizeCouponCode } from "@/lib/commerce/discounts";
import { getDb } from "@/lib/db";
import type { CartLineInput } from "@/lib/catalog/types";

import { createOrderAccessToken } from "./access";
import { CheckoutError } from "./errors";
import { allocateOrderNumber } from "./order-number";
import { releaseExpiredReservations, releaseOrder, reserveStock } from "./reservations";

/*
 * Placing an order, in one database transaction:
 *
 *   1. hold stock for every line (atomic, sorted by variant to avoid deadlocks)
 *   2. take the next order number
 *   3. count the discount-code use (atomic against its limit)
 *   4. write the order, its immutable line snapshots, the stock audit and the timeline
 *
 * Any failure rolls all of it back. Prices, discount and delivery come from a
 * fresh server-side quote, never from the browser. A repeated submission of the
 * same checkout (double click, retry) returns the same order.
 */

export interface PlaceOrderInput {
  details: CheckoutDetails;
  lines: CartLineInput[];
  couponCode: string | null;
  /** Random id of this browser checkout session. */
  checkoutSession: string;
  /**
   * The signed-in customer placing the order (from the server-side session, never
   * the browser), or null for a guest. Deliberately not part of the idempotency
   * key: the same checkout submitted twice is one order either way — and if the
   * first submission was a guest's (its answer lost) and the repeat comes after
   * signing in, in the same tab, that order joins the account.
   */
  userId: string | null;
}

export interface PlacedOrder {
  number: string;
  /** Secret for the order's private link (only ever held in memory and in that link). */
  accessToken: string;
  created: boolean;
}

const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

export async function placeOrder(input: PlaceOrderInput, now = new Date()): Promise<PlacedOrder> {
  const db = getDb();
  const { details } = input;
  const address = details.deliveryMethod === "delivery" ? details : null;

  // Stock held by lapsed checkouts goes back on sale before this one is priced.
  await releaseExpiredReservations(now);

  const quote = await quoteCheckout({
    lines: input.lines,
    deliveryMethod: details.deliveryMethod,
    stateCode: address?.state ?? null,
    couponCode: input.couponCode,
    email: details.email,
  });

  if (quote.cart.lines.length === 0) throw new CheckoutError("empty_bag", "Your bag is empty.");
  if (quote.cart.issues.length > 0) {
    throw new CheckoutError("bag_changed", "Some pieces in your bag have changed. Please check it before placing your order.");
  }
  if (input.couponCode && !quote.coupon) {
    throw new CheckoutError("coupon_invalid", quote.couponError ?? "That code can’t be used on this order.");
  }
  if (!quote.delivery) {
    throw new CheckoutError("delivery_unavailable", "That delivery option isn’t available. Please choose another.");
  }

  const { cart, delivery, coupon, totals } = quote;
  const checkoutKey = createHash("sha256")
    .update(
      JSON.stringify([
        input.checkoutSession,
        cart.lines.map((line) => [line.variantId, line.quantity]).sort(),
        details,
        coupon?.code ?? null,
      ]),
    )
    .digest("hex");
  const access = createOrderAccessToken();

  // A newer checkout from this browser replaces its older unpaid ones, so abandoned attempts can't hoard stock.
  const superseded = await db.order.findMany({
    where: { checkoutSession: input.checkoutSession, status: "PENDING", NOT: { checkoutKey } },
    select: { id: true },
  });
  for (const { id } of superseded) await releaseOrder(id, "superseded");

  const existing = await findExisting(checkoutKey, access.hash, input.userId);
  if (existing) return { number: existing, accessToken: access.token, created: false };

  const reservedUntil = new Date(now.getTime() + siteConfig.commerce.reservationMinutes * 60_000);

  try {
    const number = await db.$transaction(async (tx) => {
      // A cancelled order may still hold this key; free it so the same checkout can be placed again.
      await tx.order.updateMany({ where: { checkoutKey, status: "CANCELLED" }, data: { checkoutKey: null } });

      for (const line of [...cart.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        if (!(await reserveStock(tx, line.variantId, line.quantity))) {
          throw new CheckoutError(
            "stock_conflict",
            `Someone has just bought the last of the ${line.name} in ${line.colorName}, ${line.sizeLabel}. Your bag has been updated.`,
          );
        }
      }

      const orderNumber = await allocateOrderNumber(tx, now);

      if (coupon) {
        const counted = await tx.$executeRaw`
          UPDATE "Coupon" SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
          WHERE "id" = ${coupon.couponId} AND "isActive" AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")`;
        if (counted !== 1) throw new CheckoutError("coupon_invalid", "That code has just reached its limit.");
      }

      const order = await tx.order.create({
        data: {
          number: orderNumber,
          userId: input.userId,
          email: details.email,
          phone: details.phone,
          customerName: details.fullName,
          status: "PENDING",
          paymentStatus: "PENDING",
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingTotal: totals.shippingTotal,
          total: totals.total,
          couponId: coupon?.couponId ?? null,
          couponCode: coupon?.code ?? (input.couponCode ? normalizeCouponCode(input.couponCode) : null),
          deliveryMethod: toDbEnum<"DELIVERY" | "PICKUP">(details.deliveryMethod),
          deliveryZone: delivery.zoneId,
          deliveryEstimate: delivery.estimate,
          shipFullName: address ? details.fullName : null,
          shipPhone: address ? details.phone : null,
          shipLine1: address?.line1 ?? null,
          shipLine2: address?.line2 ?? null,
          shipCity: address?.city ?? null,
          shipState: address?.state ?? null,
          shipPostalCode: address?.postalCode ?? null,
          deliveryNotes: details.deliveryNotes ?? null,
          reservedUntil,
          checkoutKey,
          checkoutSession: input.checkoutSession,
          accessTokenHash: access.hash,
          items: {
            create: cart.lines.map((line) => ({
              variantId: line.variantId,
              productId: line.productId,
              productName: line.name,
              productSlug: line.productSlug,
              sku: line.sku,
              colorName: line.colorName,
              sizeLabel: line.sizeLabel,
              imageUrl: line.image.src,
              unitPrice: line.unitPrice,
              compareAtUnitPrice: line.compareAtUnitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            })),
          },
          events: {
            create: {
              type: "order_placed",
              toStatus: "PENDING",
              note: `Order placed; stock held for ${siteConfig.commerce.reservationMinutes} minutes awaiting payment.`,
            },
          },
        },
        select: { id: true, number: true },
      });

      await tx.inventoryAdjustment.createMany({
        data: cart.lines.map((line) => ({
          variantId: line.variantId,
          reservedDelta: line.quantity,
          reason: "ORDER_RESERVED" as const,
          orderId: order.id,
          note: `Held for ${order.number}`,
        })),
      });
      if (coupon) {
        await tx.couponUsage.create({ data: { couponId: coupon.couponId, orderId: order.id, email: details.email } });
      }

      return order.number;
    }, TRANSACTION);

    if (details.newsletter) await subscribe(details.email);
    return { number, accessToken: access.token, created: true };
  } catch (error) {
    // Two identical submissions racing past the idempotency check: the loser returns the winner's order.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await findExisting(checkoutKey, access.hash, input.userId);
      if (winner) return { number: winner, accessToken: access.token, created: false };
    }
    throw error;
  }
}

/**
 * The live order already placed for this exact checkout, if any. Its private link
 * is re-issued (the old secret was never stored), so the same browser can open it.
 * A guest order repeated by a signed-in customer joins their account; an order
 * already in an account is never moved to another.
 */
async function findExisting(checkoutKey: string, accessTokenHash: string, userId: string | null): Promise<string | null> {
  const db = getDb();
  const order = await db.order.findUnique({
    where: { checkoutKey },
    select: { id: true, number: true, status: true, userId: true },
  });
  if (!order || order.status === "CANCELLED") return null;
  const joinAccount = userId !== null && order.userId === null;
  await db.order.update({ where: { id: order.id }, data: { accessTokenHash, ...(joinAccount ? { userId } : {}) } });
  return order.number;
}

async function subscribe(email: string): Promise<void> {
  try {
    await getDb().newsletterSubscriber.upsert({
      where: { email },
      create: { email, source: "checkout" },
      update: { unsubscribedAt: null },
    });
  } catch (error) {
    // Never fail an order over a mailing-list write.
    console.error("[checkout] newsletter sign-up failed", error instanceof Error ? error.message : error);
  }
}
