"use server";

import { after } from "next/server";
import { z } from "zod";

import { quoteCheckout } from "@/lib/commerce/checkout";
import { getCheckoutMode } from "@/lib/commerce/checkout-mode";
import {
  checkoutDetailsSchema,
  checkoutFieldErrors,
  checkoutLinesSchema,
  checkoutSessionSchema,
  couponCodeSchema,
  type CheckoutField,
} from "@/lib/commerce/checkout-schema";
import type { DeliveryQuote } from "@/lib/commerce/delivery";
import type { OrderTotals } from "@/lib/commerce/totals";
import type { CartQuote } from "@/lib/catalog/types";
import { orderStatusPath } from "@/lib/orders/access";
import { placeOrder, type PlacedOrder } from "@/lib/orders/create-order";
import { CheckoutError } from "@/lib/orders/errors";
import { paymentLinks, startPayment } from "@/lib/orders/payments";
import { findOrderForAccess } from "@/lib/orders/queries";
import { sweepExpiredReservations } from "@/lib/orders/reservations";
import { requestOrigin } from "@/lib/security/origin";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * Checkout's two server actions. They are public POST endpoints like any other, so
 * each one rate-limits, re-validates its whole input, and returns only what the
 * page needs — the pricing and order logic lives in lib/commerce and lib/orders.
 */

/* ── Quote ─────────────────────────────────────────────────────────────── */

export interface ClientCheckoutQuote {
  cart: CartQuote;
  delivery: DeliveryQuote | null;
  coupon: { code: string; discount: number; description: string | null } | null;
  couponError: string | null;
  totals: OrderTotals;
}

export type CheckoutQuoteResult = { ok: true; quote: ClientCheckoutQuote } | { ok: false; message: string };

const quoteInputSchema = z.object({
  lines: z
    .array(z.strictObject({ variantId: z.string().min(1).max(64), quantity: z.int().min(1).max(999) }))
    .max(50),
  deliveryMethod: z.enum(["delivery", "pickup"]),
  stateCode: z.string().trim().max(2).nullable(),
  couponCode: couponCodeSchema.nullable(),
  email: z.string().trim().max(254).nullable(),
});

export async function getCheckoutQuote(input: unknown): Promise<CheckoutQuoteResult> {
  if (!rateLimit(`checkout-quote:${await clientAddress()}`, { limit: 120, windowMs: 60_000 }).ok) {
    return { ok: false, message: "Too many updates at once. Please wait a moment." };
  }

  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "We couldn’t read your bag. Please refresh the page." };

  try {
    const { cart, delivery, coupon, couponError, totals } = await quoteCheckout(parsed.data);
    after(() => sweepExpiredReservations());
    return {
      ok: true,
      quote: {
        cart,
        delivery,
        coupon: coupon ? { code: coupon.code, discount: coupon.discount, description: coupon.description } : null,
        couponError,
        totals,
      },
    };
  } catch (error) {
    console.error("[checkout] quote failed", error);
    return { ok: false, message: "We couldn’t price your order just now. Please try again." };
  }
}

/* ── Place order ───────────────────────────────────────────────────────── */

export type PlaceOrderResult =
  | { ok: true; redirectTo: string; /** Paystack's checkout, outside this site. */ external: boolean }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Partial<Record<CheckoutField, string>>;
    };

const placeOrderSchema = z.object({
  lines: checkoutLinesSchema,
  details: z.unknown(),
  couponCode: couponCodeSchema.nullable(),
  checkoutSession: checkoutSessionSchema,
});

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const mode = getCheckoutMode();
  if (mode === "unavailable") {
    return { ok: false, code: "unavailable", message: "Online checkout isn’t open yet. Please try again soon." };
  }
  if (!rateLimit(`checkout-order:${await clientAddress()}`, { limit: 10, windowMs: 10 * 60_000 }).ok) {
    return { ok: false, code: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." };
  }

  const envelope = placeOrderSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, code: "invalid", message: "We couldn’t read your order. Please refresh the page and try again." };
  }

  const details = checkoutDetailsSchema.safeParse(envelope.data.details);
  if (!details.success) {
    return {
      ok: false,
      code: "invalid_details",
      message: "Please check the highlighted details.",
      fieldErrors: checkoutFieldErrors(details.error),
    };
  }

  let placed: PlacedOrder;
  try {
    placed = await placeOrder({
      details: details.data,
      lines: envelope.data.lines,
      couponCode: envelope.data.couponCode || null,
      checkoutSession: envelope.data.checkoutSession,
    });
  } catch (error) {
    if (error instanceof CheckoutError) return { ok: false, code: error.code, message: error.message };
    console.error("[checkout] order failed", error);
    return {
      ok: false,
      code: "unknown",
      message: "We couldn’t place your order. Nothing has been charged — please try again.",
    };
  }

  const orderPage = orderStatusPath(placed.number, placed.accessToken);
  if (mode === "live") {
    try {
      const order = await findOrderForAccess(placed.number, placed.accessToken);
      if (order) {
        const links = paymentLinks(await requestOrigin(), placed.number, placed.accessToken);
        return { ok: true, redirectTo: await startPayment(order, links), external: true };
      }
    } catch (error) {
      // The order exists and holds its pieces; its page offers "Complete payment" to try again.
      if (!(error instanceof CheckoutError)) console.error("[checkout] could not start payment", error);
    }
  }
  return { ok: true, redirectTo: orderPage, external: false };
}

/* ── Resume payment (from the order page) ──────────────────────────────── */

export type ResumePaymentResult = { ok: true; redirectTo: string } | { ok: false; message: string };

const resumeSchema = z.object({
  orderNumber: z.string().regex(/^ORD-\d{4}-\d{6,}$/),
  key: z.string().min(16).max(128),
});

export async function resumePaymentAction(input: unknown): Promise<ResumePaymentResult> {
  if (getCheckoutMode() !== "live") return { ok: false, message: "Online payment isn’t available right now." };
  if (!rateLimit(`checkout-pay:${await clientAddress()}`, { limit: 10, windowMs: 10 * 60_000 }).ok) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes and try again." };
  }

  const parsed = resumeSchema.safeParse(input);
  const order = parsed.success ? await findOrderForAccess(parsed.data.orderNumber, parsed.data.key) : null;
  if (!parsed.success || !order) return { ok: false, message: "We couldn’t find that order." };

  try {
    const links = paymentLinks(await requestOrigin(), order.number, parsed.data.key);
    return { ok: true, redirectTo: await startPayment(order, links) };
  } catch (error) {
    if (error instanceof CheckoutError) return { ok: false, message: error.message };
    console.error("[checkout] could not resume payment", error);
    return { ok: false, message: "We couldn’t open the payment page. Please try again." };
  }
}
