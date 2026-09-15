import type { OrderView } from "@/lib/orders/types";

/*
 * What an order's status means to the customer. Pure (no server or browser APIs),
 * so the private order link, the account pages and any future email all say the
 * same thing about the same order.
 */

type OrderStatusInput = {
  status: OrderView["status"];
  paymentStatus: OrderView["paymentStatus"];
  reservedUntil: string | null;
};

/**
 * Where an unfinished or settled order stands, as the order page frames it.
 * - "paid": money arrived (the order may be anywhere from confirmed to delivered).
 * - "awaiting_payment": still holding its pieces, unpaid.
 * - "hold_ended": unpaid and the hold has lapsed; the sweep will release it.
 * - "released": cancelled without payment.
 * - "needs_refund": cancelled, but a payment arrived anyway (after the hold lapsed).
 */
export type OrderState = "paid" | "awaiting_payment" | "hold_ended" | "released" | "needs_refund";

export function orderState(order: OrderStatusInput, now: Date = new Date()): OrderState {
  if (order.status === "cancelled") return order.paymentStatus === "success" ? "needs_refund" : "released";
  if (order.status !== "pending" || order.paymentStatus === "success") return "paid";
  if (order.reservedUntil && new Date(order.reservedUntil) <= now) return "hold_ended";
  return "awaiting_payment";
}

export type OrderStatusTone = "neutral" | "positive" | "attention";

/** A short, customer-facing word for an order's status, and how loudly to show it. */
export function orderStatusLabel(
  order: OrderStatusInput,
  now: Date = new Date(),
): { label: string; tone: OrderStatusTone } {
  if (order.status === "refunded" || (order.status === "cancelled" && order.paymentStatus === "refunded")) {
    return { label: "Refunded", tone: "neutral" };
  }

  switch (orderState(order, now)) {
    case "needs_refund":
      return { label: "Refund due", tone: "attention" };
    case "released":
      return { label: "Cancelled", tone: "neutral" };
    case "hold_ended":
      return { label: "Hold ended", tone: "neutral" };
    case "awaiting_payment":
      return { label: "Awaiting payment", tone: "attention" };
    case "paid":
      break;
  }

  switch (order.status) {
    case "processing":
      return { label: "Processing", tone: "positive" };
    case "shipped":
      return { label: "Shipped", tone: "positive" };
    case "delivered":
      return { label: "Delivered", tone: "positive" };
    default:
      // "paid", or "pending" with a successful payment the order hasn't caught up with yet.
      return { label: "Confirmed", tone: "positive" };
  }
}
