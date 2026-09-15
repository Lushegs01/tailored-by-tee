import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { orderStatusPath } from "@/lib/orders/access";
import { accountOrderPath } from "@/lib/orders/account-payment";
import { settlePayment } from "@/lib/orders/payments";
import { findOrderForAccess, findOrderForUser } from "@/lib/orders/queries";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * GET /api/payments/paystack/return — where Paystack sends the shopper after paying
 * (it appends ?trxref=…&reference=…). We verify with Paystack directly, apply the
 * result, then show the order page. The redirect itself proves nothing; only
 * Paystack's verification does. Side effects live here, never in page rendering.
 *
 * Two kinds of return:
 * - with ?key= (checkout and the private order link): the key opens the order, and
 *   the shopper goes back to that private page — unchanged;
 * - without a key (paying from the account): the signed-in customer must be able to
 *   see the order, and goes back to it in their account. Paystack's redirect is a
 *   top-level GET navigation, so the Lax session cookie comes with it.
 * Anything invalid or unauthorised goes to the homepage, confirming nothing.
 */

const orderNumber = z.string().max(32).regex(/^ORD-\d{4}-\d{6,}$/);
const paymentReference = z.string().min(1).max(100);

const keyedSchema = z.object({ order: orderNumber, key: z.string().min(16).max(128), reference: paymentReference });
const accountSchema = z.object({ order: orderNumber, reference: paymentReference });

interface ReturnTarget {
  order: { id: string; number: string };
  reference: string;
  /** The page to land on afterwards. */
  path: string;
}

async function resolveReturn(search: URLSearchParams): Promise<ReturnTarget | null> {
  const input = { order: search.get("order"), reference: search.get("reference") ?? search.get("trxref") };

  if (search.has("key")) {
    const parsed = keyedSchema.safeParse({ ...input, key: search.get("key") });
    if (!parsed.success) return null;
    const { order: number, key, reference } = parsed.data;
    const order = await findOrderForAccess(number, key);
    return order ? { order, reference, path: orderStatusPath(order.number, key) } : null;
  }

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const order = await findOrderForUser(user, parsed.data.order);
  return order ? { order, reference: parsed.data.reference, path: accountOrderPath(order.number) } : null;
}

export async function GET(request: NextRequest) {
  const home = new URL("/", request.url);

  if (!rateLimit(`paystack-return:${await clientAddress()}`, { limit: 30, windowMs: 60_000 }).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  const target = await resolveReturn(request.nextUrl.searchParams);
  if (!target) return Response.redirect(home, 303);
  const { order, reference, path } = target;

  // Only a payment that belongs to this order is settled from this link.
  const payment = await getDb().payment.findFirst({ where: { reference, orderId: order.id }, select: { id: true } });
  if (payment) {
    try {
      await settlePayment(reference);
    } catch (error) {
      // The webhook will settle it; the order page shows what is known so far.
      console.error(`[payments] return verification failed for ${reference}`, error instanceof Error ? error.message : error);
    }
  }

  return Response.redirect(new URL(path, request.url), 303);
}
