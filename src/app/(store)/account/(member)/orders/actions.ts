"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getCheckoutMode } from "@/lib/commerce/checkout-mode";
import { accountPaymentLinks } from "@/lib/orders/account-payment";
import { CheckoutError } from "@/lib/orders/errors";
import { startPayment } from "@/lib/orders/payments";
import { findOrderForUser } from "@/lib/orders/queries";
import { requestOrigin } from "@/lib/security/origin";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * "Complete payment" from an order in the account. A public POST endpoint like any
 * server action: the order is found under the signed-in customer's visibility rule
 * (never from anything the browser claims), and only then handed to Paystack.
 */

export type ResumeAccountPaymentResult = { ok: true; redirectTo: string } | { ok: false; message: string };

const orderNumberSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^ORD-\d{4}-\d{6,}$/);

const NOT_FOUND = "We couldn’t find that order in your account.";

export async function resumeAccountPayment(orderNumber: unknown): Promise<ResumeAccountPaymentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has ended. Please sign in again to pay for this order." };

  const address = await clientAddress();
  const withinLimits =
    rateLimit(`account-pay:user:${user.id}`, { limit: 10, windowMs: 10 * 60_000 }).ok &&
    rateLimit(`account-pay:ip:${address}`, { limit: 20, windowMs: 10 * 60_000 }).ok;
  if (!withinLimits) return { ok: false, message: "Too many attempts. Please wait a few minutes and try again." };

  const parsed = orderNumberSchema.safeParse(orderNumber);
  if (!parsed.success) return { ok: false, message: NOT_FOUND };

  if (getCheckoutMode() !== "live") return { ok: false, message: "Online payment isn’t available right now." };

  try {
    const order = await findOrderForUser(user, parsed.data);
    if (!order) return { ok: false, message: NOT_FOUND };

    const links = accountPaymentLinks(await requestOrigin(), order.number);
    return { ok: true, redirectTo: await startPayment(order, links) };
  } catch (error) {
    if (error instanceof CheckoutError) return { ok: false, message: error.message };
    console.error("[account] could not resume payment", error);
    return { ok: false, message: "We couldn’t open the payment page. Please try again." };
  }
}
