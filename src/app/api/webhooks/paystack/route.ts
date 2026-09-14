import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { settlePayment } from "@/lib/orders/payments";
import { verifyPaystackSignature, webhookEventKey } from "@/lib/payments/paystack-core";

/*
 * POST /api/webhooks/paystack — Paystack's server-to-server notifications.
 *
 * 1. The signature (HMAC-SHA512 of the raw body with our secret key) must match,
 *    or nothing happens.
 * 2. Each delivery is recorded once by event + transaction; a redelivery that was
 *    already processed is acknowledged without doing anything again.
 * 3. The body is only a trigger: the payment is re-verified with Paystack's API
 *    before any order changes (settlePayment), so a replayed or stale event can't
 *    confirm anything on its own.
 *
 * Anything other than a 200 makes Paystack retry, so failures return 500 on purpose.
 */

const MAX_BODY_BYTES = 128 * 1024;

const eventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z
    .object({
      id: z.union([z.number(), z.string()]).nullish(),
      reference: z.string().max(100).nullish(),
    })
    .passthrough(),
});

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !isDatabaseConfigured()) return new Response("Payments are not configured", { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return new Response("Unrecognised event", { status: 400 });

  const { event, data } = parsed.data;
  const id = webhookEventKey(event, data);
  const db = getDb();

  const seen = await db.webhookEvent.findUnique({ where: { id }, select: { processedAt: true } });
  if (seen?.processedAt) return Response.json({ received: true, duplicate: true });
  if (!seen) {
    try {
      await db.webhookEvent.create({
        data: { id, provider: "paystack", type: event, reference: data.reference ?? null, payload: payload as Prisma.InputJsonValue },
      });
    } catch (error) {
      // A concurrent delivery recorded it first; carry on — settling is idempotent.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }

  if (event === "charge.success" && data.reference) {
    try {
      const outcome = await settlePayment(data.reference);
      if (outcome === "unknown_reference") console.warn(`[webhooks] ${data.reference} is not one of our payments`);
    } catch (error) {
      console.error(`[webhooks] could not settle ${data.reference}`, error instanceof Error ? error.message : error);
      return new Response("Could not process", { status: 500 });
    }
  }

  await db.webhookEvent.update({ where: { id }, data: { processedAt: new Date() } });
  return Response.json({ received: true });
}
