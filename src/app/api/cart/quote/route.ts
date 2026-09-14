import { after } from "next/server";
import { z } from "zod";

import { MAX_CART_LINES, MAX_VARIANT_ID_LENGTH } from "@/components/cart/cart-lines";
import { quoteCart } from "@/lib/catalog/repository";
import { sweepExpiredReservations } from "@/lib/orders/reservations";

/*
 * POST /api/cart/quote: prices a bag. The client may only say which variants and
 * how many; names, prices, stock and totals are resolved here, so nothing the
 * browser sends can influence what a customer pays.
 *
 * Only the request's shape is enforced here. Business limits (per-line maximum,
 * stock, duplicate lines) are applied by quoteCart, which merges and clamps with
 * an explanatory issue — so a bag saved under older limits corrects itself
 * instead of failing every request.
 */

const MAX_BODY_BYTES = 10 * 1024;
/** Sanity ceiling for a single line; the real per-line limit is applied when pricing. */
const MAX_REQUESTED_QUANTITY = 999;
const NO_STORE = { "Cache-Control": "no-store" } as const;

const quoteRequestSchema = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        variantId: z.string().min(1).max(MAX_VARIANT_ID_LENGTH),
        quantity: z.int().min(1).max(MAX_REQUESTED_QUANTITY),
      }),
    )
    .max(MAX_CART_LINES),
});

function errorResponse(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: NO_STORE });
}

/** Reads the body as text, refusing to buffer more than `limit` bytes. Null when too large. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function POST(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse(415, "unsupported_media_type", "Send the bag as application/json.");
  }

  let body: string | null;
  try {
    body = await readBody(request, MAX_BODY_BYTES);
  } catch {
    return errorResponse(400, "unreadable_body", "The request body could not be read.");
  }
  if (body === null) {
    return errorResponse(413, "payload_too_large", "The request body is too large.");
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return errorResponse(400, "invalid_json", "The request body is not valid JSON.");
  }

  const parsed = quoteRequestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return errorResponse(400, "invalid_cart", `${where}${issue?.message ?? "The bag could not be read."}`);
  }

  try {
    const quote = await quoteCart(parsed.data.lines);
    // Housekeeping after the response: return stock held by lapsed, unpaid checkouts.
    after(() => sweepExpiredReservations());
    return Response.json(quote, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/cart/quote] Pricing failed", error);
    return errorResponse(500, "quote_failed", "The bag could not be priced. Please try again.");
  }
}
