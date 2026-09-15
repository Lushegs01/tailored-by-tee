import "server-only";

import { z } from "zod";

import { normalizeNigerianPhone } from "@/lib/commerce/phone";
import { getDb, isDatabaseConfigured } from "@/lib/db";

/*
 * The customer's own details. Scoped by the user id from the session, never by
 * one the browser sends. Email is not editable here: it is the sign-in identity,
 * and order visibility relies on it being an address the customer has proved
 * they own — changing it is a studio task, not a form field.
 */

export interface AccountProfile {
  id: string;
  email: string;
  name: string | null;
  /** E.164, e.g. "+2348031234567". */
  phone: string | null;
  /** ISO. */
  memberSince: string;
}

const PHONE_MESSAGE = "Enter a Nigerian mobile number, e.g. 0803 123 4567.";

export const profileInputSchema = z.object({
  name: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, "Enter your name.")
    .max(100, "That name is too long."),
  /** Optional; normalised exactly as checkout does. Empty clears it. */
  phone: z
    .string()
    .trim()
    .max(32, PHONE_MESSAGE)
    .nullish()
    .transform((value, context) => {
      if (!value) return null;
      const normalized = normalizeNigerianPhone(value);
      if (!normalized) {
        context.addIssue({ code: "custom", message: PHONE_MESSAGE });
        return z.NEVER;
      }
      return normalized;
    }),
});

export type ProfileInput = z.input<typeof profileInputSchema>;
export type ProfileField = "name" | "phone";
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

export type ProfileUpdateResult =
  | { ok: true; profile: AccountProfile }
  | { ok: false; reason: "invalid"; message: string; fieldErrors: ProfileFieldErrors }
  | { ok: false; reason: "not_found" | "unavailable"; message: string };

const PROFILE_SELECT = { id: true, email: true, name: true, phone: true, createdAt: true } as const;

function toProfile(row: { id: string; email: string; name: string | null; phone: string | null; createdAt: Date }): AccountProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    memberSince: row.createdAt.toISOString(),
  };
}

export async function getProfile(userId: string): Promise<AccountProfile | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await getDb().user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  return row ? toProfile(row) : null;
}

export async function updateProfile(userId: string, input: unknown): Promise<ProfileUpdateResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "unavailable", message: "Your profile isn’t available right now. Please try again soon." };
  }

  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: ProfileFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "name" || field === "phone") && !(field in fieldErrors)) fieldErrors[field] = issue.message;
    }
    return { ok: false, reason: "invalid", message: "Please check the highlighted details.", fieldErrors };
  }

  const [row] = await getDb().user.updateManyAndReturn({
    where: { id: userId },
    data: { name: parsed.data.name, phone: parsed.data.phone },
    select: PROFILE_SELECT,
  });
  if (!row) return { ok: false, reason: "not_found", message: "We couldn’t find your account. Please sign in again." };
  return { ok: true, profile: toProfile(row) };
}
