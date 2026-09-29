import type { DeliveryMethod, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/*
 * What an admin may do to an order, and what each step is called.
 *
 * Pure — no database, no network, no "server-only" — so the page, the dialogs in
 * the browser and the tests all read the same rules, and the server can re-check
 * every one of them before it writes. The server is the authority: `allowed` is
 * called again inside each action, after the order has been read.
 *
 * Two things are deliberately absent:
 * - There is no action that marks a payment as paid. Payment state changes only
 *   through Paystack's own verification (settlePayment) or its refund API.
 * - Nothing here writes. Statuses are changed by conditional updates in
 *   lib/admin/orders.ts, guarded on the status and updatedAt the admin saw.
 */

export const ORDERS_PATH = "/admin/orders";
export const ORDERS_EXPORT_PATH = "/admin/orders/export";

/** An order's page, keyed by its number (as every other admin page links to it). */
export function orderPath(orderNumber: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(orderNumber)}`;
}

/* ── The actions ────────────────────────────────────────────────────────── */

/** Every order status, as a tuple, for zod's enum in the server actions. */
export const ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const satisfies readonly OrderStatus[];

export const ORDER_ACTIONS = [
  "start_processing",
  "mark_shipped",
  "mark_delivered",
  "cancel_unpaid",
  "cancel_paid",
  "refund",
  "recheck_payment",
] as const;

export type OrderAction = (typeof ORDER_ACTIONS)[number];

export function isOrderAction(value: string): value is OrderAction {
  return (ORDER_ACTIONS as readonly string[]).includes(value);
}

/** What the server knows about an order when it decides whether a step is allowed. */
export interface OrderContext {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMethod: DeliveryMethod;
  /** Paystack has confirmed at least one payment on this order. */
  paid: boolean;
  /** A refund has been asked of Paystack and hasn't finished yet. */
  refundInProgress: boolean;
  /** The confirmed payment has already been refunded in full. */
  fullyRefunded: boolean;
  /** There is a payment attempt Paystack can still be asked about. */
  hasPaymentToCheck: boolean;
}

export type Allowance = { ok: true } | { ok: false; reason: string };

const ALLOWED: Allowance = { ok: true };

function no(reason: string): Allowance {
  return { ok: false, reason };
}

/** The statuses each step may start from. The server re-checks this, then updates conditionally. */
export const ACTION_FROM: Record<OrderAction, readonly OrderStatus[]> = {
  start_processing: ["PAID"],
  mark_shipped: ["PAID", "PROCESSING"],
  mark_delivered: ["SHIPPED"],
  cancel_unpaid: ["PENDING"],
  cancel_paid: ["PAID", "PROCESSING"],
  refund: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
  recheck_payment: ["PENDING"],
};

/**
 * The status the step moves the order to, or null when it doesn't change the
 * status by itself (a refund's outcome depends on Paystack; a re-check depends on
 * what Paystack says happened).
 */
export const ACTION_TO: Record<OrderAction, OrderStatus | null> = {
  start_processing: "PROCESSING",
  mark_shipped: "SHIPPED",
  mark_delivered: "DELIVERED",
  cancel_unpaid: "CANCELLED",
  cancel_paid: "CANCELLED",
  refund: null,
  recheck_payment: null,
};

/** The order timestamp a step fills in, or null when it sets none. */
export const ACTION_TIMESTAMP: Record<OrderAction, "shippedAt" | "deliveredAt" | "cancelledAt" | null> = {
  start_processing: null,
  mark_shipped: "shippedAt",
  mark_delivered: "deliveredAt",
  cancel_unpaid: "cancelledAt",
  cancel_paid: "cancelledAt",
  refund: null,
  recheck_payment: null,
};

/**
 * The audit action a step records, in the vocabulary the Settings activity list
 * reads ("order.ship" → "Order marked shipped"). The two cancellations share one
 * action because they are the same thing to the reader; which it was is in the
 * entry's own summary and metadata.
 */
export const ACTION_AUDIT: Record<OrderAction, string> = {
  start_processing: "order.process",
  mark_shipped: "order.ship",
  mark_delivered: "order.deliver",
  cancel_unpaid: "order.cancel",
  cancel_paid: "order.cancel",
  refund: "refund.create",
  recheck_payment: "order.payment.status",
};

/** The OrderEvent `type` a step records on the timeline. */
export const ACTION_EVENT: Record<OrderAction, string> = {
  start_processing: "processing_started",
  mark_shipped: "order_shipped",
  mark_delivered: "order_delivered",
  cancel_unpaid: "order_cancelled",
  cancel_paid: "order_cancelled",
  refund: "refund_requested",
  recheck_payment: "payment_rechecked",
};

/**
 * Whether `action` may be taken on an order in this state, and if not, why — in
 * one sentence the owner can act on.
 */
export function allowed(action: OrderAction, context: OrderContext): Allowance {
  const pickup = context.deliveryMethod === "PICKUP";

  switch (action) {
    case "start_processing": {
      if (context.status === "PROCESSING") return no("This order is already ready to ship.");
      if (context.status === "PENDING") {
        return no("This order hasn’t been paid yet. Wait for Paystack to confirm the payment.");
      }
      if (context.status !== "PAID") return no("Only a paid order can be prepared.");
      return ALLOWED;
    }

    case "mark_shipped": {
      if (context.status === "SHIPPED") {
        return no(pickup ? "This order is already ready for collection." : "This order is already marked as shipped.");
      }
      if (context.status === "DELIVERED") {
        return no(pickup ? "This order has already been collected." : "This order has already been delivered.");
      }
      if (context.status === "PENDING") {
        return no("This order hasn’t been paid yet. Wait for Paystack to confirm the payment.");
      }
      if (!ACTION_FROM.mark_shipped.includes(context.status)) {
        return no(
          pickup
            ? "Only a paid order can be marked as ready for collection."
            : "Only a paid order can be marked as shipped.",
        );
      }
      return ALLOWED;
    }

    case "mark_delivered": {
      if (context.status === "DELIVERED") {
        return no(pickup ? "This order has already been collected." : "This order has already been delivered.");
      }
      if (!ACTION_FROM.mark_delivered.includes(context.status)) {
        return no(
          pickup
            ? "Mark the order as ready for collection first."
            : "Mark the order as shipped before marking it delivered.",
        );
      }
      return ALLOWED;
    }

    case "cancel_unpaid": {
      if (context.paid || context.paymentStatus === "SUCCESS") {
        return no("This order has been paid. Cancel it with a refund instead.");
      }
      if (context.status !== "PENDING") {
        return no("Only an order still waiting for payment can be cancelled this way.");
      }
      return ALLOWED;
    }

    case "cancel_paid": {
      if (!context.paid) return no("No payment was confirmed for this order, so there is nothing to refund.");
      if (context.status === "CANCELLED") return no("This order is already cancelled.");
      if (context.status === "REFUNDED") return no("This order has already been refunded.");
      if (context.status === "SHIPPED" || context.status === "DELIVERED") {
        return no(
          pickup
            ? "This order has already been handed over. Refund it instead of cancelling it."
            : "This order has already left the studio. Refund it instead of cancelling it.",
        );
      }
      if (!ACTION_FROM.cancel_paid.includes(context.status)) {
        return no("Only a paid order that hasn’t left the studio can be cancelled.");
      }
      return ALLOWED;
    }

    case "refund": {
      if (!context.paid) return no("No payment was confirmed for this order, so there is nothing to refund.");
      if (context.refundInProgress) {
        return no("A refund for this order is already with Paystack. Check its status first.");
      }
      if (context.fullyRefunded) return no("This payment has already been refunded in full.");
      if (context.status === "PENDING") {
        return no("The payment is still being confirmed. Refresh the page in a moment and try again.");
      }
      if (!ACTION_FROM.refund.includes(context.status)) return no("This order can’t be refunded.");
      return ALLOWED;
    }

    case "recheck_payment": {
      if (context.status !== "PENDING") {
        return no("Only an order still waiting for payment needs checking with Paystack.");
      }
      if (!context.hasPaymentToCheck) {
        return no("No payment has been started for this order, so there is nothing for Paystack to check.");
      }
      return ALLOWED;
    }
  }
}

/** Every step the owner may take right now, in the order they're offered. */
export function availableActions(context: OrderContext): OrderAction[] {
  return ORDER_ACTIONS.filter((action) => allowed(action, context).ok);
}

/* ── What each step is called ───────────────────────────────────────────── */

export interface ActionCopy {
  /** The button, e.g. "Mark as shipped". */
  label: string;
  /** The confirmation dialog's question. */
  title: string;
  /** One sentence under it. */
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  /** Destructive steps get the red button and start focus on "Go back". */
  tone: "default" | "destructive";
}

/**
 * The words for a step. Collection orders never "ship": they become "ready for
 * collection" and then "collected", which is what the studio actually does.
 */
export function actionCopy(action: OrderAction, deliveryMethod: DeliveryMethod): ActionCopy {
  const pickup = deliveryMethod === "PICKUP";

  switch (action) {
    case "start_processing":
      return {
        label: "Start preparing",
        title: "Start preparing this order?",
        description: pickup
          ? "The order moves on while you put it together. The customer isn’t emailed."
          : "The order moves to “Ready to ship”. The customer isn’t emailed.",
        confirmLabel: "Start preparing",
        pendingLabel: "Saving…",
        tone: "default",
      };

    case "mark_shipped":
      return pickup
        ? {
            label: "Ready for collection",
            title: "Mark this order as ready for collection?",
            description: "The customer is emailed to say their order is ready to collect from the studio.",
            confirmLabel: "Ready for collection",
            pendingLabel: "Saving…",
            tone: "default",
          }
        : {
            label: "Mark as shipped",
            title: "Mark this order as shipped?",
            description: "The customer is emailed, with the tracking details if you add them.",
            confirmLabel: "Mark as shipped",
            pendingLabel: "Saving…",
            tone: "default",
          };

    case "mark_delivered":
      return pickup
        ? {
            label: "Mark as collected",
            title: "Mark this order as collected?",
            description: "The customer is emailed to confirm they have their order.",
            confirmLabel: "Mark as collected",
            pendingLabel: "Saving…",
            tone: "default",
          }
        : {
            label: "Mark as delivered",
            title: "Mark this order as delivered?",
            description: "The customer is emailed to confirm their order arrived.",
            confirmLabel: "Mark as delivered",
            pendingLabel: "Saving…",
            tone: "default",
          };

    case "cancel_unpaid":
      return {
        label: "Cancel order",
        title: "Cancel this unpaid order?",
        description: "The held pieces go back on sale and any discount code is given back. This can’t be undone.",
        confirmLabel: "Cancel order",
        pendingLabel: "Cancelling…",
        tone: "destructive",
      };

    case "cancel_paid":
      return {
        label: "Cancel order",
        title: "Cancel this paid order?",
        description: "The customer has paid, so decide what happens to their money before you cancel.",
        confirmLabel: "Cancel order",
        pendingLabel: "Cancelling…",
        tone: "destructive",
      };

    case "refund":
      return {
        label: "Refund payment",
        title: "Refund this payment?",
        description: "Paystack returns the full amount to the customer. This can’t be undone.",
        confirmLabel: "Refund payment",
        pendingLabel: "Asking Paystack…",
        tone: "destructive",
      };

    case "recheck_payment":
      return {
        label: "Check payment",
        title: "Check this payment with Paystack?",
        description: "Paystack is asked what happened to the latest attempt, and the order follows its answer.",
        confirmLabel: "Check payment",
        pendingLabel: "Checking…",
        tone: "default",
      };
  }
}

/** The line shown once a step has been taken. */
export function successMessage(action: OrderAction, deliveryMethod: DeliveryMethod, orderNumber: string): string {
  const pickup = deliveryMethod === "PICKUP";
  switch (action) {
    case "start_processing":
      return `${orderNumber} is ready to ship.`;
    case "mark_shipped":
      return pickup ? `${orderNumber} is ready for collection.` : `${orderNumber} is marked as shipped.`;
    case "mark_delivered":
      return pickup ? `${orderNumber} is marked as collected.` : `${orderNumber} is marked as delivered.`;
    case "cancel_unpaid":
      return `${orderNumber} is cancelled and its pieces are back on sale.`;
    case "cancel_paid":
      return `${orderNumber} is cancelled.`;
    case "refund":
      return `The refund for ${orderNumber} is with Paystack.`;
    case "recheck_payment":
      return `Paystack has been asked about the payment for ${orderNumber}.`;
  }
}

/** "shipped" / "ready for collection", for sentences that aren't a button. */
export function shippedWord(deliveryMethod: DeliveryMethod): string {
  return deliveryMethod === "PICKUP" ? "ready for collection" : "shipped";
}

/** "delivered" / "collected". */
export function deliveredWord(deliveryMethod: DeliveryMethod): string {
  return deliveryMethod === "PICKUP" ? "collected" : "delivered";
}

/** Shown when the order changed between the page loading and the step being taken. */
export const STALE_MESSAGE =
  "This order changed while you were looking at it. The page has been reloaded — check it, then try again.";

/* ── Refunds ────────────────────────────────────────────────────────────── */

export type RefundOutcome = "processed" | "pending" | "failed";

const REFUND_PROCESSED = new Set(["processed", "success", "successful", "completed", "reversed"]);
const REFUND_FAILED = new Set(["failed", "declined", "cancelled", "canceled", "rejected"]);

/**
 * What Paystack's refund `status` means for us. Anything unrecognised reads as
 * "pending" on purpose: a refund we can't classify is one to keep watching, never
 * one to write off.
 */
export function refundOutcome(status: string): RefundOutcome {
  const value = status.trim().toLowerCase();
  if (REFUND_PROCESSED.has(value)) return "processed";
  if (REFUND_FAILED.has(value)) return "failed";
  return "pending";
}

/* ── The timeline ───────────────────────────────────────────────────────── */

const EVENT_LABELS: Record<string, string> = {
  order_placed: "Order placed",
  payment_confirmed: "Payment confirmed",
  payment_confirmed_after_release: "Payment confirmed after the hold ended",
  payment_rejected: "Payment rejected",
  payment_needs_refund: "Payment needs a refund",
  payment_rechecked: "Payment checked with Paystack",
  duplicate_payment: "A second payment arrived",
  order_released: "Hold released",
  processing_started: "Preparing started",
  order_shipped: "Marked as shipped",
  order_ready_for_collection: "Ready for collection",
  order_delivered: "Marked as delivered",
  order_collected: "Marked as collected",
  order_cancelled: "Order cancelled",
  tracking_updated: "Tracking details updated",
  refund_requested: "Refund requested",
  refund_pending: "Refund with Paystack",
  refund_processed: "Refund completed",
  refund_failed: "Refund failed",
  refund_restocked: "Pieces returned to stock",
  note: "Note",
  confirmation_emailed: "Confirmation emailed",
  confirmation_email_failed: "Confirmation email failed",
  confirmation_email_refused: "Confirmation email refused",
  status_emailed: "Update emailed",
  status_email_failed: "Update email failed",
};

/**
 * A timeline entry's heading. Collection orders read "ready for collection" and
 * "collected" where a delivery reads "shipped" and "delivered". Anything not
 * listed (an event added later, or by another part of the site) becomes readable
 * rather than raw: "payment_queued" → "Payment queued".
 */
export function orderEventLabel(type: string, deliveryMethod: DeliveryMethod): string {
  if (deliveryMethod === "PICKUP") {
    if (type === "order_shipped") return EVENT_LABELS.order_ready_for_collection;
    if (type === "order_delivered") return EVENT_LABELS.order_collected;
  }
  const known = EVENT_LABELS[type];
  if (known) return known;
  // The status emails record one type per step ("status_emailed_ready_for_collection").
  if (type.startsWith("status_email_refused")) return "Update email refused";
  if (type.startsWith("status_email_failed")) return EVENT_LABELS.status_email_failed;
  if (type.startsWith("status_emailed")) return EVENT_LABELS.status_emailed;
  const words = type.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Change";
}

/** Timeline entries that mean something went wrong, so they read in the critical tone. */
const TROUBLE = new Set([
  "payment_rejected",
  "payment_needs_refund",
  "duplicate_payment",
  "refund_failed",
  "confirmation_email_failed",
  "confirmation_email_refused",
  "status_email_failed",
]);

export function isTroubleEvent(type: string): boolean {
  return TROUBLE.has(type) || type.startsWith("status_email_failed") || type.startsWith("status_email_refused");
}
