"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { parseInput, withAdmin, type AdminActionResult } from "@/lib/admin/auth";
import {
  discountActiveSchema,
  discountDuplicateSchema,
  discountFormSchema,
  discountIdSchema,
  discountPath,
  discountStatusDisplay,
} from "@/lib/admin/discount-schema";
import {
  createDiscount as createCoupon,
  deleteDiscount as deleteCoupon,
  duplicateDiscount as duplicateCoupon,
  getDiscount,
  setDiscountActive as setCouponActive,
  updateDiscount as updateCoupon,
  type DiscountWriteFailure,
} from "@/lib/admin/discounts";
import { formatNumber } from "@/lib/admin/format";
import { refreshAdminView } from "@/lib/admin/refresh";
import { zId } from "@/lib/admin/validation";

/*
 * Discount code changes from /admin/discounts. Each action: admin check and rate
 * limit (withAdmin), every field re-validated with zod (lib/admin/discount-schema),
 * then one transaction in lib/admin/discounts that writes the change and its
 * audit entry naming the admin. Checkout reads codes live, so nothing in the
 * storefront's cache needs expiring; the admin page is re-rendered instead.
 *
 * Create and copy end on the new code's page (?saved=created|copied); delete
 * returns and lets the dialog take the admin back to the list.
 */

const WRITE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

const NOT_FOUND = "This discount can’t be found any more — it may have been deleted. Go back to the list and refresh.";
const MISSING = "Something is missing from this form. Refresh the page and try again.";

function failure(reason: DiscountWriteFailure, count?: number): Extract<AdminActionResult<never>, { ok: false }> {
  switch (reason) {
    case "code_taken": {
      const message = "Another discount already uses this code. Choose a different one.";
      return { ok: false, message, fieldErrors: { code: message } };
    }
    case "not_found":
      return { ok: false, message: NOT_FOUND };
    case "restriction_missing":
      return {
        ok: false,
        message:
          "One of the chosen categories or products no longer exists. Refresh the page, check what the code applies to, and save again.",
      };
    case "below_uses": {
      const uses = formatNumber(count ?? 0);
      const message = `It has now been used ${uses} time${count === 1 ? "" : "s"}, so the limit can’t be lower than ${uses}.`;
      return { ok: false, message, fieldErrors: { usageLimit: message } };
    }
    case "in_use":
      return {
        ok: false,
        message: `It has been used on ${formatNumber(count ?? 1)} order${count === 1 ? "" : "s"}, so it can’t be deleted — those orders refer to it. Switch it off instead to stop new orders using it.`,
      };
    case "needs_migration":
      return {
        ok: false,
        message:
          "The database needs an update before discounts can be changed. Ask your developer to run npm run db:deploy, then try again.",
      };
  }
}

/** Creates a code from the form, then opens its page. */
export async function createDiscount(
  _previous: AdminActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<AdminActionResult<{ id: string }>> {
  return withAdmin<{ id: string }>(
    "coupon.create",
    async (admin) => {
      const parsed = parseInput(discountFormSchema({ now: new Date() }), formData);
      if (!parsed.ok) return parsed;

      const result = await createCoupon(parsed.data, admin.id);
      if (!result.ok) return failure(result.reason, result.count);
      redirect(`${discountPath(result.data.id)}?saved=created`);
    },
    WRITE_LIMIT,
  );
}

const idField = z.object({ id: zId(MISSING) });

/**
 * Saves the form over an existing code. Its on/off switch is separate
 * (setDiscountActive), so a save never undoes a switch made meanwhile.
 */
export async function updateDiscount(
  _previous: AdminActionResult<{ code: string }> | null,
  formData: FormData,
): Promise<AdminActionResult<{ code: string }>> {
  return withAdmin<{ code: string }>(
    "coupon.update",
    async (admin) => {
      const target = parseInput(idField, formData);
      if (!target.ok) return { ok: false, message: MISSING };
      const current = await getDiscount(target.data.id);
      if (!current) return failure("not_found");

      const parsed = parseInput(
        discountFormSchema({
          now: new Date(),
          current: { startsAt: current.startsAt, endsAt: current.endsAt, usageCount: current.usageCount },
        }),
        formData,
      );
      if (!parsed.ok) return parsed;

      const result = await updateCoupon(current.id, parsed.data, admin.id);
      if (!result.ok) return failure(result.reason, result.count);

      const { code, previousCode, changes, amountChanged, usesSoFar } = result.data;
      if (changes.length === 0) return { ok: true, data: { code }, message: "Nothing had changed, so there was nothing to save." };

      refreshAdminView();
      const notes = ["Discount saved."];
      if (previousCode !== code) notes.push(`The old code ${previousCode} no longer works.`);
      if (amountChanged && usesSoFar > 0) {
        notes.push("The new terms apply to orders from now on; orders already placed keep the discount they got.");
      }
      return { ok: true, data: { code }, message: notes.join(" ") };
    },
    WRITE_LIMIT,
  );
}

/** Switches a code on or off. Input: { id, active }. */
export async function setDiscountActive(input: unknown): Promise<AdminActionResult<{ isActive: boolean }>> {
  return withAdmin<{ isActive: boolean }>(
    "coupon.active",
    async (admin) => {
      const parsed = parseInput(discountActiveSchema, input);
      if (!parsed.ok) return { ok: false, message: MISSING };
      const { id, active } = parsed.data;

      const result = await setCouponActive(id, active, admin.id);
      if (!result.ok) return failure(result.reason, result.count);
      refreshAdminView();

      const { code, isActive, changed } = result.data;
      if (!changed) {
        return { ok: true, data: { isActive }, message: `${code} was already switched ${isActive ? "on" : "off"}.` };
      }
      if (!isActive) {
        return {
          ok: true,
          data: { isActive },
          message: `${code} is switched off. Customers can’t use it until you switch it back on.`,
        };
      }

      // Switched on, but it may still be waiting for its start, past its end or used up.
      const coupon = await getDiscount(id);
      const status = coupon ? discountStatusDisplay(coupon) : null;
      const caveat = status && status.status !== "active" ? ` ${status.description}` : " Customers can use it now.";
      return { ok: true, data: { isActive }, message: `${code} is switched on.${caveat}` };
    },
    WRITE_LIMIT,
  );
}

/** Deletes a code no order has used. Input: { id }. */
export async function deleteDiscount(input: unknown): Promise<AdminActionResult<{ code: string }>> {
  return withAdmin<{ code: string }>(
    "coupon.delete",
    async (admin) => {
      const parsed = parseInput(discountIdSchema, input);
      if (!parsed.ok) return { ok: false, message: MISSING };

      const result = await deleteCoupon(parsed.data.id, admin.id);
      if (!result.ok) return failure(result.reason, result.count);
      return { ok: true, data: { code: result.data.code }, message: `Discount ${result.data.code} deleted.` };
    },
    WRITE_LIMIT,
  );
}

/** Copies a code under a new one (switched off), then opens the copy. Form fields: id, code. */
export async function duplicateDiscount(
  _previous: AdminActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<AdminActionResult<{ id: string }>> {
  return withAdmin<{ id: string }>(
    "coupon.duplicate",
    async (admin) => {
      const parsed = parseInput(discountDuplicateSchema, formData);
      if (!parsed.ok) return parsed;

      const result = await duplicateCoupon(parsed.data.id, parsed.data.code, admin.id);
      if (!result.ok) return failure(result.reason, result.count);
      redirect(`${discountPath(result.data.id)}?saved=copied`);
    },
    WRITE_LIMIT,
  );
}
