import type { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { orderStatusPath } from "@/lib/orders/access";
import { settlePayment } from "@/lib/orders/payments";
import { findOrderForAccess } from "@/lib/orders/queries";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * GET /api/payments/paystack/return — where Paystack sends the shopper after paying
 * (it appends ?trxref=…&reference=…). We verify with Paystack directly, apply the
 * result, then show the order page. The redirect itself proves nothing; only
 * Paystack's verification does. Side effects live here, never in page rendering.
 */

const paramsSchema = z.object({
  order: z.string().regex(/^ORD-\d{4}-\d{6,}$/),
  key: z.string().min(16).max(128),
  reference: z.string().min(1).max(100),
});

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const home = new URL("/", request.url);

  if (!rateLimit(`paystack-return:${await clientAddress()}`, { limit: 30, windowMs: 60_000 }).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  const parsed = paramsSchema.safeParse({
    order: search.get("order"),
    key: search.get("key"),
    reference: search.get("reference") ?? search.get("trxref"),
  });
  if (!parsed.success) return Response.redirect(home, 303);

  const { order: orderNumber, key, reference } = parsed.data;
  const order = await findOrderForAccess(orderNumber, key);
  if (!order) return Response.redirect(home, 303);

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

  return Response.redirect(new URL(orderStatusPath(order.number, key), request.url), 303);
}
