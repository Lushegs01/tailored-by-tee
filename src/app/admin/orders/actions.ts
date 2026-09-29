"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import {
  ORDERS_PATH,
  ORDER_STATUSES,
  orderPath,
  successMessage,
  type OrderAction,
} from "@/lib/admin/order-transitions";
import {
  addOrderNote as addNote,
  applyTransition,
  cancelUnpaidOrder,
  checkRefundStatus,
  getAdminOrder,
  isMissingSchemaError,
  NEEDS_MIGRATION_MESSAGE,
  recheckPayment,
  requestRefund,
  saveTracking,
  type OrderWriteFailure,
} from "@/lib/admin/orders";
import { refreshAdminView } from "@/lib/admin/refresh";
import { zCheckbox, zId, zOneOf, zOptionalText } from "@/lib/admin/validation";
import { scheduleOrderStatusEmail, statusEmailKind } from "@/lib/email/order-status-email";

/*
 * Every step an admin takes on an order.
 *
 * Each one: admin check and rate limit first (withAdmin), then every field
 * re-validated with zod, then a conditional write in lib/admin/orders guarded on
 * the status and the moment the admin saw — so two admins, or an admin and a
 * Paystack webhook, can never both apply the same step. Each write records the
 * acting admin on the order's timeline (OrderEvent.actorId) and, where it
 * matters, in the audit trail, inside the same transaction. Nothing throws at the
 * browser: every answer is an AdminActionResult.
 *
 * There is no action here that marks a payment as paid. "Check payment" asks
 * Paystack and applies its answer; a refund goes through Paystack's refund API.
 * The browser's figures are never trusted — they say what the admin saw, and the
 * database decides what actually changes.
 *
 * Customer emails are scheduled with after(), never awaited: an order is marked
 * shipped whether or not Resend is reachable.
 */

const STEP_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const REFUND_LIMIT = { limit: 10, windowMs: 60_000 } as const;
const NOTE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

const MISSING = "Something is missing from this form. Refresh the page and try again.";
const NOT_FOUND = "This order can’t be found any more. Refresh the page and try again.";

/** The order as the admin saw it, echoed back by the form so a stale step is refused. */
const expected = {
  number: zId(MISSING),
  status: zOneOf(ORDER_STATUSES, MISSING),
  updatedAt: z.preprocess(
    (value) => (typeof value === "string" || value instanceof Date ? new Date(value) : value),
    z.date({ error: MISSING }),
  ),
};

function failureResult(failure: OrderWriteFailure): { ok: false; message: string } {
  return { ok: false, message: failure.reason === "not_found" ? NOT_FOUND : failure.message };
}

/** After a step: the list, this order's page, and the navigation counts. */
function refreshOrder(orderNumber: string, catalogChanged = false): void {
  revalidatePath(ORDERS_PATH);
  revalidatePath(orderPath(orderNumber));
  if (catalogChanged) refreshStorefrontCatalog();
  refreshAdminView();
}

/* ── Moving an order along ──────────────────────────────────────────────── */

const STEPS = ["start_processing", "mark_delivered"] as const;

const advanceSchema = z.object({ ...expected, action: zOneOf(STEPS, MISSING) });

/**
 * "Start preparing" and "Mark as delivered" (or collected): a plain status step,
 * with no details to fill in.
 */
export async function advanceOrder(input: unknown): Promise<AdminActionResult> {
  return withAdmin<null>(
    "order.advance",
    async (admin) => {
      const parsed = parseInput(advanceSchema, input);
      if (!parsed.ok) return parsed;
      const { number, status, updatedAt, action } = parsed.data;

      const result = await run(() =>
        applyTransition({ orderNumber: number, action, expected: { status, updatedAt }, actorId: admin.id }),
      );
      if (!result.ok) {
        refreshOrder(number);
        return failureResult(result);
      }

      if (result.emailStatus) {
        scheduleOrderStatusEmail(result.orderId, statusEmailKind(result.emailStatus, result.deliveryMethod));
      }
      refreshOrder(number);
      return { ok: true, data: null, message: successMessage(action, result.deliveryMethod, number) };
    },
    STEP_LIMIT,
  );
}

const MAX_TRACKING = 120;

const shipSchema = z.object({
  ...expected,
  carrier: zOptionalText({ max: MAX_TRACKING, label: "The courier’s name" }),
  trackingNumber: zOptionalText({ max: MAX_TRACKING, label: "The tracking number" }),
});

/**
 * "Mark as shipped" (or "Ready for collection"), with the courier and tracking
 * reference for a delivery. The customer is emailed afterwards.
 */
export async function shipOrder(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  return withAdmin<null>(
    "order.ship",
    async (admin) => {
      const parsed = parseInput(shipSchema, formData);
      if (!parsed.ok) return parsed;
      const { number, status, updatedAt, carrier, trackingNumber } = parsed.data;

      const result = await run(() =>
        applyTransition({
          orderNumber: number,
          action: "mark_shipped",
          expected: { status, updatedAt },
          actorId: admin.id,
          carrier,
          trackingNumber,
        }),
      );
      if (!result.ok) {
        refreshOrder(number);
        return failureResult(result);
      }

      scheduleOrderStatusEmail(result.orderId, statusEmailKind("SHIPPED", result.deliveryMethod));
      refreshOrder(number);
      return { ok: true, data: null, message: successMessage("mark_shipped", result.deliveryMethod, number) };
    },
    STEP_LIMIT,
  );
}

const trackingSchema = z.object({
  ...expected,
  carrier: zOptionalText({ max: MAX_TRACKING, label: "The courier’s name" }),
  trackingNumber: zOptionalText({ max: MAX_TRACKING, label: "The tracking number" }),
});

/** Adds or corrects the courier details after an order has already gone out. */
export async function saveOrderTracking(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  return withAdmin<null>(
    "order.tracking",
    async (admin) => {
      const parsed = parseInput(trackingSchema, formData);
      if (!parsed.ok) return parsed;
      const { number, status, updatedAt, carrier, trackingNumber } = parsed.data;

      const result = await run(() =>
        saveTracking({
          orderNumber: number,
          expected: { status, updatedAt },
          carrier,
          trackingNumber,
          actorId: admin.id,
        }),
      );
      if (!result.ok) {
        refreshOrder(number);
        return failureResult(result);
      }

      refreshOrder(number);
      return { ok: true, data: null, message: "Tracking details saved." };
    },
    STEP_LIMIT,
  );
}

const cancelSchema = z.object(expected);

/**
 * Cancels an order. Which cancellation it is — an unpaid one, whose pieces go
 * back on sale, or a paid one, which then clearly needs refunding — is decided
 * here from the order itself, never from what the browser says.
 */
export async function cancelOrder(input: unknown): Promise<AdminActionResult<{ paid: boolean }>> {
  return withAdmin<{ paid: boolean }>(
    "order.cancel",
    async (admin) => {
      const parsed = parseInput(cancelSchema, input);
      if (!parsed.ok) return parsed;
      const { number, status, updatedAt } = parsed.data;

      // Which cancellation this is comes from the order itself. Read through the
      // same guard as the writes, so a database still missing the admin tables
      // says so plainly instead of reaching the unexpected-error message.
      let order: Awaited<ReturnType<typeof getAdminOrder>>;
      try {
        order = await getAdminOrder(number);
      } catch (error) {
        if (isMissingSchemaError(error)) return { ok: false, message: NEEDS_MIGRATION_MESSAGE };
        throw error;
      }
      if (!order) return { ok: false, message: NOT_FOUND };
      const paid = order.context.paid;
      const action: OrderAction = paid ? "cancel_paid" : "cancel_unpaid";

      const result = await run(() =>
        paid
          ? applyTransition({
              orderNumber: number,
              action: "cancel_paid",
              expected: { status, updatedAt },
              actorId: admin.id,
            })
          : cancelUnpaidOrder({ orderNumber: number, expected: { status, updatedAt }, actorId: admin.id }),
      );
      if (!result.ok) {
        refreshOrder(number);
        return failureResult(result);
      }

      // An unpaid cancellation puts held pieces back on sale, which the storefront shows.
      refreshOrder(number, !paid);
      return {
        ok: true,
        data: { paid },
        message: paid
          ? `${number} is cancelled. The customer has paid, so refund the payment below.`
          : successMessage(action, order.deliveryMethod, number),
      };
    },
    STEP_LIMIT,
  );
}

/* ── Payments ───────────────────────────────────────────────────────────── */

const recheckSchema = z.object(expected);

/**
 * Asks Paystack what happened to the latest payment attempt and applies its
 * answer. This is the only way an order becomes paid from the admin area, and it
 * is Paystack's verification that decides, not the admin.
 */
export async function recheckOrderPayment(input: unknown): Promise<AdminActionResult> {
  return withAdmin<null>(
    "order.recheck",
    async (admin) => {
      const parsed = parseInput(recheckSchema, input);
      if (!parsed.ok) return parsed;
      const { number, status, updatedAt } = parsed.data;

      const result = await run(() =>
        recheckPayment({ orderNumber: number, expected: { status, updatedAt }, actorId: admin.id }),
      );
      if (!result.ok) {
        refreshOrder(number);
        return failureResult(result);
      }

      // A confirmed payment turns held pieces into sold ones, which the storefront shows.
      refreshOrder(number, result.outcome === "paid" || result.outcome === "paid_after_release");
      return { ok: true, data: null, message: result.message };
    },
    STEP_LIMIT,
  );
}

const MAX_REASON = 300;

const refundSchema = z.object({
  ...expected,
  paymentId: zId(MISSING),
  reason: zOptionalText({ max: MAX_REASON, label: "The reason" }),
  restock: zCheckbox(),
});

/**
 * Returns a payment through Paystack's refund API. Never more than the payment,
 * never twice: the payment row is locked while the refund is claimed. Optionally
 * puts the pieces back on sale.
 */
/**
 * What the refund form's action hands back. AdminForm passes a failed result
 * straight back in as `previous`, so both sides have to be the same shape.
 */
type RefundResult = AdminActionResult<{ status: string; restocked: boolean }>;

export async function refundOrder(_previous: RefundResult | null, formData: FormData): Promise<RefundResult> {
  return withAdmin<{ status: string; restocked: boolean }>(
    "order.refund",
    async (admin) => {
      const parsed = parseInput(refundSchema, formData);
      if (!parsed.ok) return parsed;
      const { number, status, updatedAt, paymentId, reason, restock } = parsed.data;

      const result = await run(() =>
        requestRefund({
          orderNumber: number,
          expected: { status, updatedAt },
          paymentId,
          reason,
          restock,
          actorId: admin.id,
        }),
      );
      if (!result.ok) {
        refreshOrder(number, true);
        return failureResult(result);
      }

      refreshOrder(number, result.restocked);
      const test = result.isTest ? " This was a test payment, so no real money moved." : "";
      return {
        ok: true,
        data: { status: result.status, restocked: result.restocked },
        message: `${result.message}${result.restocked ? " The pieces are back on sale." : ""}${test}`,
      };
    },
    REFUND_LIMIT,
  );
}

const checkRefundSchema = z.object({ number: zId(MISSING), refundId: zId(MISSING) });

/** Follows up a refund Paystack still had in progress. */
export async function checkOrderRefund(input: unknown): Promise<AdminActionResult<{ status: string }>> {
  return withAdmin<{ status: string }>(
    "order.refund.check",
    async (admin) => {
      const parsed = parseInput(checkRefundSchema, input);
      if (!parsed.ok) return parsed;
      const { number, refundId } = parsed.data;

      const result = await run(() => checkRefundStatus({ orderNumber: number, refundId, actorId: admin.id }));
      if (!result.ok) {
        refreshOrder(number);
        return failureResult(result);
      }

      refreshOrder(number);
      return { ok: true, data: { status: result.status }, message: result.message };
    },
    REFUND_LIMIT,
  );
}

/* ── Notes ──────────────────────────────────────────────────────────────── */

const MAX_NOTE = 500;

const noteSchema = z.object({
  number: zId(MISSING),
  note: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z
      .string()
      .trim()
      .min(1, "Write the note before saving it.")
      .max(MAX_NOTE, `A note must be ${MAX_NOTE} characters or fewer.`),
  ),
});

/** Adds an internal note to the order's timeline. The customer never sees it. */
export async function addOrderNote(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  return withAdmin<null>(
    "order.note",
    async (admin) => {
      const parsed = parseInput(noteSchema, formData);
      if (!parsed.ok) return parsed;
      const { number, note } = parsed.data;

      const result = await run(() => addNote({ orderNumber: number, note, actorId: admin.id }));
      if (!result.ok) return failureResult(result);

      refreshOrder(number);
      return { ok: true, data: null, message: "Note added." };
    },
    NOTE_LIMIT,
  );
}

/* ── Shared ─────────────────────────────────────────────────────────────── */

/**
 * Runs a write and turns a missing admin table or column (the migration hasn't
 * been applied) into a plain sentence rather than a stack trace.
 */
async function run<T extends { ok: boolean }>(work: () => Promise<T>): Promise<T | OrderWriteFailure> {
  try {
    return await work();
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, reason: "provider", message: NEEDS_MIGRATION_MESSAGE };
    throw error;
  }
}
