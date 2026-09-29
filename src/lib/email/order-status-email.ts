import "server-only";

import { after } from "next/server";

import { findState } from "@/config/nigeria";
import { deliveryPolicy } from "@/config/policies";
import type { Prisma } from "@/generated/prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";

import {
  renderOrderStatusEmail,
  tidy,
  tidyOptional,
  type OrderStatusEmailKind,
  type StatusEmailOrder,
} from "./order-status-template";
import { isEmailConfigured, sendEmail } from "./send";
import { EmailSendError, sendFailureKind } from "./send-failure";

/*
 * The emails an admin's step sends: "on its way", "ready to collect", "it's
 * arrived", "thank you for collecting".
 *
 * Built like the order confirmation (order-emails.ts) and with the same
 * guarantees: one email per order and step, recorded on the order's timeline once
 * it has gone, so a repeated step (or two admins clicking at once) never sends
 * twice. Resend's idempotency key backs that up for 24 hours even if the timeline
 * entry can't be written. A send that fails is recorded too, and one Resend
 * refused for good (a bad address) isn't recorded as sent, so the owner can see
 * on the order why the customer heard nothing.
 *
 * Nothing here ever throws at its caller: an admin action is never failed, undone
 * or delayed because an email couldn't go out. The status change is the work; the
 * email is a courtesy that follows it.
 */

export type { OrderStatusEmailKind } from "./order-status-template";
export { statusEmailKind } from "./order-status-template";

/** The timeline entry that records a sent update, one type per step. */
export function statusEmailedEvent(kind: OrderStatusEmailKind): string {
  return `status_emailed_${kind}`;
}

/** A send that failed and may work later. */
function statusEmailFailedEvent(kind: OrderStatusEmailKind): string {
  return `status_email_failed_${kind}`;
}

/** A send Resend refused in a way that would only repeat: not tried again. */
function statusEmailRefusedEvent(kind: OrderStatusEmailKind): string {
  return `status_email_refused_${kind}`;
}

/** The statuses each email is still true for; anything else and it isn't sent. */
const STILL_TRUE: Record<OrderStatusEmailKind, readonly string[]> = {
  shipped: ["SHIPPED", "DELIVERED"],
  ready_for_collection: ["SHIPPED", "DELIVERED"],
  delivered: ["DELIVERED"],
  collected: ["DELIVERED"],
};

const statusSelect = {
  id: true,
  number: true,
  email: true,
  customerName: true,
  status: true,
  isDemo: true,
  deliveryMethod: true,
  deliveryZone: true,
  deliveryEstimate: true,
  shipFullName: true,
  shipLine1: true,
  shipLine2: true,
  shipCity: true,
  shipState: true,
  shipPostalCode: true,
  trackingNumber: true,
  carrier: true,
  items: {
    orderBy: { id: "asc" },
    select: { productName: true, colorName: true, sizeLabel: true, quantity: true },
  },
} satisfies Prisma.OrderSelect;

type StatusRow = Prisma.OrderGetPayload<{ select: typeof statusSelect }>;

function toStatusEmail(row: StatusRow, kind: OrderStatusEmailKind): StatusEmailOrder {
  const pickup = row.deliveryMethod === "PICKUP";
  const zone = deliveryPolicy.zones.find((item) => item.id === row.deliveryZone);
  const stateName = findState(row.shipState ?? "")?.name ?? tidyOptional(row.shipState);

  return {
    kind,
    number: tidy(row.number),
    customerName: tidy(row.customerName),
    items: row.items.map((item) => ({
      name: tidy(item.productName),
      colorName: tidy(item.colorName),
      sizeLabel: tidy(item.sizeLabel),
      quantity: item.quantity,
    })),
    deliveryLabel: pickup ? (deliveryPolicy.pickup?.name ?? "Collection") : (zone?.name ?? "Delivery"),
    deliveryEstimate: tidyOptional(row.deliveryEstimate),
    addressLines: pickup
      ? [tidyOptional(deliveryPolicy.pickup?.address)].filter((line): line is string => Boolean(line))
      : [
          tidyOptional(row.shipFullName),
          tidyOptional(row.shipLine1),
          tidyOptional(row.shipLine2),
          [tidyOptional(row.shipCity), stateName].filter(Boolean).join(", ") || null,
          tidyOptional(row.shipPostalCode),
        ].filter((line): line is string => Boolean(line)),
    carrier: tidyOptional(row.carrier),
    trackingNumber: tidyOptional(row.trackingNumber),
  };
}

/**
 * Emails the customer one order update, unless it has gone already (or was
 * refused for good, or the order is demo data, or there's no Resend key). Never
 * throws: every failure is logged and, where it can be, recorded on the order.
 */
export async function sendOrderStatusEmail(orderId: string, kind: OrderStatusEmailKind): Promise<void> {
  if (!isEmailConfigured() || !isDatabaseConfigured()) return;

  const db = getDb();
  let row: StatusRow | null;
  try {
    row = await db.order.findUnique({ where: { id: orderId }, select: statusSelect });
  } catch (error) {
    console.error(`[email] could not load order ${orderId} for a ${kind} update`, message(error));
    return;
  }
  if (!row) {
    console.warn(`[email] order ${orderId} not found; no ${kind} update sent`);
    return;
  }
  // Demo orders are evaluation data: never email the address on them.
  if (row.isDemo) return;
  if (!STILL_TRUE[kind].includes(row.status)) return;

  const sentType = statusEmailedEvent(kind);
  const refusedType = statusEmailRefusedEvent(kind);
  try {
    const recorded = await db.orderEvent.findFirst({
      where: { orderId, type: { in: [sentType, refusedType] } },
      select: { id: true },
    });
    if (recorded) return;
  } catch (error) {
    // Can't tell whether it has gone. Resend's idempotency key still prevents a second copy.
    console.error(`[email] could not check whether ${row.number} had its ${kind} update`, message(error));
  }

  const email = renderOrderStatusEmail(toStatusEmail(row, kind));
  let note = "Update emailed to the customer.";
  try {
    await sendEmail({
      to: row.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `order-${kind}-${row.id}`,
    });
  } catch (error) {
    const failure = sendFailureKind(error);
    // The same email is already on its way (two admins at once): that send decides.
    if (failure === "in_progress") return;
    if (failure !== "already_sent") {
      await recordFailedSend(row.id, row.number, kind, failure === "permanent", error);
      return;
    }
    note = "Update emailed (Resend already had it under this order’s key).";
  }

  try {
    await db.orderEvent.create({ data: { orderId: row.id, type: sentType, note } });
  } catch (error) {
    // Sent, just not recorded: a repeat within 24 hours is dropped by Resend's key.
    console.error(`[email] ${row.number}: ${kind} update sent but not recorded`, message(error));
  }
}

async function recordFailedSend(
  orderId: string,
  orderNumber: string,
  kind: OrderStatusEmailKind,
  permanent: boolean,
  error: unknown,
): Promise<void> {
  const reason =
    error instanceof EmailSendError
      ? `Resend responded ${error.status}${error.code ? ` (${error.code})` : ""}`
      : "Resend could not be reached";
  console.error(`[email] ${orderNumber}: ${kind} update not sent — ${reason}`);
  try {
    await getDb().orderEvent.create({
      data: {
        orderId,
        type: permanent ? statusEmailRefusedEvent(kind) : statusEmailFailedEvent(kind),
        note: `Update not emailed: ${reason}. ${permanent ? "It won’t be tried again." : "Take the step again to try once more."}`,
      },
    });
  } catch (recordError) {
    console.error(`[email] ${orderNumber}: could not record a failed ${kind} update`, message(recordError));
  }
}

/**
 * Sends the update after the current response, without delaying or ever failing
 * the admin's action. Inside a request (server actions, route handlers) it runs
 * via after(); anywhere else it runs detached.
 */
export function scheduleOrderStatusEmail(orderId: string, kind: OrderStatusEmailKind): void {
  if (!isEmailConfigured()) return;

  const task = () =>
    sendOrderStatusEmail(orderId, kind).catch((error: unknown) => {
      console.error(`[email] ${kind} update for ${orderId} failed`, message(error));
    });

  try {
    after(task);
  } catch {
    // No request scope (a script, say): send it on its own.
    void task();
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
