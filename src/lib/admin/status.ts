import type {
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  RefundStatus,
  ReviewStatus,
} from "@/generated/prisma/enums";
import { stockStatus } from "@/lib/catalog/inventory";

/*
 * What each status is called in the admin area, and how loudly it shows. One
 * vocabulary for every admin page (orders, overview, customers, products,
 * inventory, reviews), in the owner's words rather than the database's. Pure, so
 * server pages, client components and tests agree.
 *
 *   const status = orderStatusDisplay(order);
 *   <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
 *
 * Tones: "attention" = the owner needs to act; "critical" = something went wrong;
 * "positive" = done or healthy; "info" = in progress, nothing to do; "neutral" =
 * closed or inactive.
 */

/** How loudly a status reads. The word always carries the meaning too, never colour alone. */
export type StatusTone = "neutral" | "positive" | "attention" | "critical" | "info";

export interface StatusDisplay {
  /** A short badge word or two: "Ready to ship". */
  label: string;
  tone: StatusTone;
  /** One plain sentence for detail pages and filter hints. */
  description: string;
}

/* ── Orders ─────────────────────────────────────────────────────────────── */

const ORDER_STATUS: Record<OrderStatus, StatusDisplay> = {
  PENDING: {
    label: "Awaiting payment",
    tone: "info",
    description: "Placed, but not paid yet. The pieces are held for a short time, then released.",
  },
  PAID: {
    label: "To prepare",
    tone: "attention",
    description: "Paid. Prepare the pieces, then mark the order as ready to ship.",
  },
  PROCESSING: {
    label: "Ready to ship",
    tone: "attention",
    description: "Being packed or waiting for the courier. Mark it as shipped when it leaves.",
  },
  SHIPPED: {
    label: "Shipped",
    tone: "info",
    description: "On its way to the customer.",
  },
  DELIVERED: {
    label: "Delivered",
    tone: "positive",
    description: "The customer has it.",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "neutral",
    description: "Cancelled. Any held pieces went back into stock.",
  },
  REFUNDED: {
    label: "Refunded",
    tone: "neutral",
    description: "The payment was returned to the customer.",
  },
};

/** The order statuses in workflow order, for filter selects: [{ value: "PAID", label: "To prepare" }, …]. */
export const ORDER_STATUS_OPTIONS: readonly { value: OrderStatus; label: string }[] = (
  ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const
).map((value) => ({ value, label: ORDER_STATUS[value].label }));

export interface OrderStatusInput {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** When an unpaid order's hold ends. */
  reservedUntil?: Date | string | null;
}

/**
 * An order's status in the owner's words. Looks past the bare status where the
 * payment tells a different story:
 * - unpaid and its hold has ended → "Payment window closed" (the sweep will cancel it);
 * - status still PENDING but Paystack confirmed payment → "Payment received" (being confirmed);
 * - cancelled although a payment arrived (e.g. after the hold ended) → "Refund due".
 */
export function orderStatusDisplay(order: OrderStatusInput, now: Date = new Date()): StatusDisplay {
  if (order.status === "PENDING") {
    if (order.paymentStatus === "SUCCESS") {
      return {
        label: "Payment received",
        tone: "attention",
        description: "Paystack confirmed the payment and the order is being confirmed. Refresh in a moment.",
      };
    }
    const until = order.reservedUntil ? new Date(order.reservedUntil) : null;
    if (until && !Number.isNaN(until.getTime()) && until <= now) {
      return {
        label: "Payment window closed",
        tone: "neutral",
        description: "Not paid in time. The order will be cancelled and its pieces returned to stock.",
      };
    }
  }
  if (order.status === "CANCELLED" && order.paymentStatus === "SUCCESS") {
    return {
      label: "Refund due",
      tone: "critical",
      description: "Cancelled, but the customer paid. Refund the payment through Paystack.",
    };
  }
  return ORDER_STATUS[order.status];
}

/** Orders the owner has to act on: paid and not yet shipped. */
export const ORDER_STATUSES_TO_FULFIL: readonly OrderStatus[] = ["PAID", "PROCESSING"];

/* ── Payments ───────────────────────────────────────────────────────────── */

const PAYMENT_STATUS: Record<PaymentStatus, StatusDisplay> = {
  PENDING: { label: "Not paid", tone: "neutral", description: "No payment has been confirmed by Paystack." },
  SUCCESS: { label: "Paid", tone: "positive", description: "Paystack confirmed the payment." },
  FAILED: { label: "Payment failed", tone: "critical", description: "The payment was declined or failed." },
  ABANDONED: { label: "Abandoned", tone: "neutral", description: "The customer left before paying." },
  REFUNDED: { label: "Refunded", tone: "neutral", description: "The payment was returned to the customer." },
};

export const PAYMENT_STATUS_OPTIONS: readonly { value: PaymentStatus; label: string }[] = (
  ["PENDING", "SUCCESS", "FAILED", "ABANDONED", "REFUNDED"] as const
).map((value) => ({ value, label: PAYMENT_STATUS[value].label }));

/**
 * A payment's status. `isTest` marks payments made with Paystack test keys (no
 * real money moved), whatever their status says.
 */
export function paymentStatusDisplay(status: PaymentStatus, isTest = false): StatusDisplay {
  const display = PAYMENT_STATUS[status];
  if (!isTest) return display;
  return {
    label: `${display.label} (test)`,
    tone: status === "SUCCESS" ? "info" : display.tone,
    description: `${display.description} Made with Paystack test keys, so no real money moved.`,
  };
}

/* ── Refunds ────────────────────────────────────────────────────────────── */

const REFUND_STATUS: Record<RefundStatus, StatusDisplay> = {
  PENDING: {
    label: "Refund in progress",
    tone: "info",
    description: "Paystack has the refund request. Banks can take several working days.",
  },
  PROCESSED: { label: "Refunded", tone: "positive", description: "Paystack returned the money." },
  FAILED: {
    label: "Refund failed",
    tone: "critical",
    description: "Paystack could not process the refund. Check the Paystack dashboard.",
  },
};

export function refundStatusDisplay(status: RefundStatus): StatusDisplay {
  return REFUND_STATUS[status];
}

/* ── Products ───────────────────────────────────────────────────────────── */

const PRODUCT_STATUS: Record<ProductStatus, StatusDisplay> = {
  DRAFT: { label: "Draft", tone: "neutral", description: "Hidden from the store while you work on it." },
  ACTIVE: {
    label: "Live",
    tone: "positive",
    description: "In the store. It shows once it has at least one photo.",
  },
  ARCHIVED: {
    label: "Archived",
    tone: "neutral",
    description: "Hidden from the store and kept for past orders.",
  },
};

export const PRODUCT_STATUS_OPTIONS: readonly { value: ProductStatus; label: string }[] = (
  ["ACTIVE", "DRAFT", "ARCHIVED"] as const
).map((value) => ({ value, label: PRODUCT_STATUS[value].label }));

export function productStatusDisplay(status: ProductStatus): StatusDisplay {
  return PRODUCT_STATUS[status];
}

/* ── Reviews ────────────────────────────────────────────────────────────── */

const REVIEW_STATUS: Record<ReviewStatus, StatusDisplay> = {
  PENDING: {
    label: "Waiting for approval",
    tone: "attention",
    description: "Not shown in the store until you approve it.",
  },
  APPROVED: { label: "Published", tone: "positive", description: "Shown on the product page." },
  REJECTED: { label: "Rejected", tone: "neutral", description: "Not shown in the store." },
};

export const REVIEW_STATUS_OPTIONS: readonly { value: ReviewStatus; label: string }[] = (
  ["PENDING", "APPROVED", "REJECTED"] as const
).map((value) => ({ value, label: REVIEW_STATUS[value].label }));

export function reviewStatusDisplay(status: ReviewStatus): StatusDisplay {
  return REVIEW_STATUS[status];
}

/* ── Stock ──────────────────────────────────────────────────────────────── */

export interface StockInput {
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
}

/** Pieces that can be sold now: in stock minus those held for unpaid checkouts (never below 0). */
export function availableToSell(inventory: StockInput): number {
  return Math.max(0, inventory.onHand - inventory.reserved);
}

/** "Sold out" / "Low stock" / "In stock", by the same rule as the storefront (available ≤ threshold is low). */
export function stockDisplay(inventory: StockInput): StatusDisplay {
  switch (stockStatus(inventory)) {
    case "out_of_stock":
      return { label: "Sold out", tone: "critical", description: "Nothing available to sell." };
    case "low_stock":
      return {
        label: "Low stock",
        tone: "attention",
        description: `${availableToSell(inventory)} left to sell — at or below the low-stock level of ${inventory.lowStockThreshold}.`,
      };
    default:
      return { label: "In stock", tone: "positive", description: "Enough available to sell." };
  }
}
