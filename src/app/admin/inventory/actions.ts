"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import { refreshStorefrontCatalog } from "@/lib/admin/catalog";
import {
  adjustInventory,
  findOrderForReturn,
  getVariantStock,
  getVariantStockHistory,
  setCountedStock,
  setLowStockThreshold,
} from "@/lib/admin/inventory";
import {
  INVENTORY_PATH,
  MANUAL_ADJUST_REASONS,
  MAX_LOW_STOCK_THRESHOLD,
  MAX_STOCK_CHANGE,
  MAX_STOCK_COUNT,
  MAX_STOCK_NOTE,
  STOCK_DIRECTIONS,
  adjustmentSavedMessage,
  countBelowReservedMessage,
  countChangedMessage,
  countSavedMessage,
  isLargeStockChange,
  pieces,
  resolveStockChange,
  stockChangeFailureMessage,
  variantLabel,
  type StockHistoryPage,
} from "@/lib/admin/stock-state";
import { zCheckbox, zId, zInt, zOneOf, zOptionalText } from "@/lib/admin/validation";

/*
 * Stock changes from /admin/inventory. Each action: admin check and rate limit
 * (withAdmin), every field re-validated with zod, then one atomic conditional
 * write in lib/admin/inventory with its InventoryAdjustment (or audit entry)
 * naming the acting admin in the same transaction. Afterwards the storefront's
 * cached catalogue is expired (listings show "sold out" and "only N left" from
 * it) and the inventory page re-rendered with the new figures.
 *
 * Nothing here trusts the figures the browser saw: they are only used to ask
 * for confirmation of large changes and to detect a count made against a
 * figure that has since moved. The database decides what is allowed.
 */

const WRITE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const READ_LIMIT = { limit: 120, windowMs: 60_000 } as const;

const MISSING = "Something is missing from this form. Close it, refresh the page and try again.";
const NOT_FOUND =
  "This item can’t be found any more — it may have been removed. Refresh the page and try again.";

/** Postgres INTEGER ceiling: the most a figure the browser echoes back can be. */
const MAX_INT = 2_147_483_647;

const optionalDirection = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? null : value),
  z.enum(STOCK_DIRECTIONS, { error: "Choose whether to add or remove pieces." }).nullable(),
);

function confirmMessage(delta: number): string {
  return delta > 0
    ? `Tick the box to confirm adding ${pieces(delta)}.`
    : `Tick the box to confirm removing ${pieces(-delta)}.`;
}

function refreshInventory(storefront: boolean): void {
  if (storefront) refreshStorefrontCatalog();
  revalidatePath(INVENTORY_PATH);
}

/* ── Adjust stock ────────────────────────────────────────────────────────── */

const adjustSchema = z.object({
  variantId: zId(MISSING),
  reason: zOneOf(MANUAL_ADJUST_REASONS, "Choose why the stock is changing."),
  direction: optionalDirection,
  quantity: zInt({
    min: 1,
    max: MAX_STOCK_CHANGE,
    required: "Enter how many pieces.",
    label: "The number of pieces",
  }),
  orderNumber: zOptionalText({ max: 40, label: "The order number" }),
  note: zOptionalText({ max: MAX_STOCK_NOTE, label: "The note" }),
  /** On hand as the admin saw it: only decides whether the change needs confirming. */
  seenOnHand: zInt({ min: 0, max: MAX_INT, required: MISSING }),
  confirmLarge: zCheckbox(),
});

export interface StockLevelsResult {
  onHand: number;
  reserved: number;
}

/**
 * Adds or removes pieces with a reason (new stock, a return, damage, a
 * correction). Removing never takes on hand below zero or below what's held for
 * unpaid orders. Form fields: variantId, reason, direction (corrections only),
 * quantity, orderNumber (returns, optional), note, seenOnHand, confirmLarge.
 */
export async function adjustStock(
  _previous: AdminActionResult<StockLevelsResult> | null,
  formData: FormData,
): Promise<AdminActionResult<StockLevelsResult>> {
  return withAdmin<StockLevelsResult>(
    "inventory.adjust",
    async (admin) => {
      const parsed = parseInput(adjustSchema, formData);
      if (!parsed.ok) return parsed;
      const { variantId, reason, direction, quantity, orderNumber, note, seenOnHand, confirmLarge } =
        parsed.data;

      const change = resolveStockChange({ reason, direction, quantity });
      if (!change.ok) {
        return { ok: false, message: change.message, fieldErrors: { [change.field]: change.message } };
      }
      const { delta } = change;

      if (isLargeStockChange(delta, seenOnHand) && !confirmLarge) {
        const message = confirmMessage(delta);
        return { ok: false, message, fieldErrors: { confirmLarge: message } };
      }

      const variant = await getVariantStock(variantId);
      if (!variant) return { ok: false, message: NOT_FOUND };

      let orderId: string | null = null;
      if (reason === "ORDER_RETURNED" && orderNumber) {
        const order = await findOrderForReturn(orderNumber, variantId);
        if (!order) {
          const message = `We couldn’t find order ${orderNumber.toUpperCase()}. Check the number, or leave it blank.`;
          return { ok: false, message, fieldErrors: { orderNumber: message } };
        }
        if (!order.includesVariant) {
          const message = `Order ${order.number} doesn’t include this colour and size. Check the number, or leave it blank.`;
          return { ok: false, message, fieldErrors: { orderNumber: message } };
        }
        orderId = order.id;
      }

      const result = await adjustInventory({ variantId, delta, reason, note, actorId: admin.id, orderId });

      if (!result.ok) {
        if (result.reason === "not_found") return { ok: false, message: NOT_FOUND };
        // Show the latest figures behind the dialog, and say how many can go.
        const latest = await getVariantStock(variantId);
        refreshInventory(false);
        const maxRemovable = latest ? Math.max(0, latest.onHand - latest.reserved) : 0;
        return {
          ok: false,
          message: stockChangeFailureMessage(result.reason, latest),
          fieldErrors: {
            quantity:
              maxRemovable > 0
                ? `You can remove at most ${maxRemovable} right now.`
                : "Nothing can be removed right now.",
          },
        };
      }

      refreshInventory(true);
      return {
        ok: true,
        data: { onHand: result.onHand, reserved: result.reserved },
        message: adjustmentSavedMessage({
          label: variantLabel(variant),
          delta,
          onHand: result.onHand,
          reserved: result.reserved,
        }),
      };
    },
    WRITE_LIMIT,
  );
}

/* ── Record a count (stocktake) ──────────────────────────────────────────── */

const countSchema = z.object({
  variantId: zId(MISSING),
  counted: zInt({
    min: 0,
    max: MAX_STOCK_COUNT,
    required: "Enter how many pieces you counted.",
    label: "The count",
  }),
  /** On hand when the count began: the count only saves if it's still this. */
  expectedOnHand: zInt({ min: 0, max: MAX_INT, required: MISSING }),
  note: zOptionalText({ max: MAX_STOCK_NOTE, label: "The note" }),
  confirmLarge: zCheckbox(),
});

export interface CountResult extends StockLevelsResult {
  delta: number;
}

/**
 * Sets on hand to a physical count, recorded as a correction with the
 * difference. Refused if on hand moved since the count began (a sale, another
 * admin), so a count never silently undoes a sale. Form fields: variantId,
 * counted, expectedOnHand, note, confirmLarge.
 */
export async function recordStockCount(
  _previous: AdminActionResult<CountResult> | null,
  formData: FormData,
): Promise<AdminActionResult<CountResult>> {
  return withAdmin<CountResult>(
    "inventory.count",
    async (admin) => {
      const parsed = parseInput(countSchema, formData);
      if (!parsed.ok) return parsed;
      const { variantId, counted, expectedOnHand, note, confirmLarge } = parsed.data;

      const difference = counted - expectedOnHand;
      if (isLargeStockChange(difference, expectedOnHand) && !confirmLarge) {
        const message = confirmMessage(difference);
        return { ok: false, message, fieldErrors: { confirmLarge: message } };
      }

      const variant = await getVariantStock(variantId);
      if (!variant) return { ok: false, message: NOT_FOUND };

      const result = await setCountedStock(variantId, counted, expectedOnHand, admin.id, note);

      if (!result.ok) {
        switch (result.reason) {
          case "not_found":
            return { ok: false, message: NOT_FOUND };
          case "changed":
            // Re-render with the new figure so the form shows what to check against.
            refreshInventory(false);
            return { ok: false, message: countChangedMessage(expectedOnHand, result.onHand) };
          case "below_reserved": {
            refreshInventory(false);
            const message = countBelowReservedMessage(result.reserved);
            return { ok: false, message, fieldErrors: { counted: `Enter ${result.reserved} or more.` } };
          }
        }
      }

      refreshInventory(result.delta !== 0);
      return {
        ok: true,
        data: { onHand: result.onHand, reserved: result.reserved, delta: result.delta },
        message: countSavedMessage({
          label: variantLabel(variant),
          delta: result.delta,
          onHand: result.onHand,
        }),
      };
    },
    WRITE_LIMIT,
  );
}

/* ── Low-stock level ─────────────────────────────────────────────────────── */

const thresholdSchema = z.object({
  variantId: zId(MISSING),
  threshold: zInt({
    min: 0,
    max: MAX_LOW_STOCK_THRESHOLD,
    required: "Enter a number of pieces (0 turns the warning off).",
    label: "The low-stock level",
  }),
});

/** Sets the level at or below which a variant shows as low stock. Form fields: variantId, threshold. */
export async function saveLowStockThreshold(
  _previous: AdminActionResult<{ threshold: number }> | null,
  formData: FormData,
): Promise<AdminActionResult<{ threshold: number }>> {
  return withAdmin<{ threshold: number }>(
    "inventory.threshold",
    async (admin) => {
      const parsed = parseInput(thresholdSchema, formData);
      if (!parsed.ok) return parsed;
      const { variantId, threshold } = parsed.data;

      const variant = await getVariantStock(variantId);
      if (!variant) return { ok: false, message: NOT_FOUND };

      const saved = await setLowStockThreshold(variantId, threshold, admin.id);
      if (!saved) return { ok: false, message: NOT_FOUND };

      refreshInventory(true);
      return {
        ok: true,
        data: { threshold },
        message:
          threshold === 0
            ? `Low-stock warnings are off for ${variantLabel(variant)}.`
            : `${variantLabel(variant)} now shows as low stock at ${pieces(threshold)} or fewer.`,
      };
    },
    WRITE_LIMIT,
  );
}

/* ── History ─────────────────────────────────────────────────────────────── */

const historySchema = z.object({
  variantId: zId(MISSING),
  before: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? null : value),
    zId(MISSING).nullable(),
  ),
});

/** A variant's stock movements, newest first; `before` (a previous page's nextCursor) loads older ones. Input: { variantId, before? }. */
export async function loadStockHistory(input: unknown): Promise<AdminActionResult<StockHistoryPage>> {
  return withAdmin<StockHistoryPage>(
    "inventory.history",
    async () => {
      const parsed = parseInput(historySchema, input);
      if (!parsed.ok) return parsed;

      const page = await getVariantStockHistory(parsed.data.variantId, { before: parsed.data.before });
      if (!page) return { ok: false, message: NOT_FOUND };
      return { ok: true, data: page };
    },
    READ_LIMIT,
  );
}
