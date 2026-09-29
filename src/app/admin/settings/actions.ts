"use server";

import { z } from "zod";

import {
  NOT_ADMIN_MESSAGE,
  logAdminError,
  parseInput,
  withAdmin,
  type AdminActionResult,
} from "@/lib/admin/auth";
import { refreshAdminView } from "@/lib/admin/refresh";
import { grantAdminRole, isMissingSchemaError, revokeAdminRole } from "@/lib/admin/team";
import { zId } from "@/lib/admin/validation";

/*
 * Admin team changes, both confirmed in a dialog first. Each action: admin check
 * and rate limit (withAdmin), input re-validated with zod, the change and its
 * audit entry committed together in one transaction (lib/admin/team), then the
 * page re-rendered so the list and the activity trail update.
 */

const RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

const NEEDS_MIGRATION_MESSAGE =
  "The database needs an update before admin access can be changed here. Ask your developer to run “npm run db:deploy”.";

const grantSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Enter the email address they’ll sign in with.")
      .max(254, "That email address is too long.")
      .pipe(z.email("Enter a full email address, like name@example.com.")),
  ),
});

const revokeSchema = z.object({ userId: zId("Choose someone from the admin team.") });

export interface GrantAdminAccessResult {
  email: string;
  createdAccount: boolean;
}

/** Gives admin access to an email address. Input: { email } (a plain object or FormData). */
export async function grantAdminAccess(input: unknown): Promise<AdminActionResult<GrantAdminAccessResult>> {
  return withAdmin<GrantAdminAccessResult>(
    "settings.admin.grant",
    async (admin) => {
      const parsed = parseInput(grantSchema, input);
      if (!parsed.ok) return parsed;
      const { email } = parsed.data;

      let outcome;
      try {
        outcome = await grantAdminRole({ email, actorId: admin.id });
      } catch (error) {
        if (!isMissingSchemaError(error)) throw error;
        logAdminError("settings.admin.grant", error);
        return { ok: false, message: NEEDS_MIGRATION_MESSAGE };
      }

      if (!outcome.ok) {
        if (outcome.reason === "actor_not_admin") return { ok: false, message: NOT_ADMIN_MESSAGE };
        refreshAdminView();
        const message = `${email} already has admin access.`;
        return { ok: false, message, fieldErrors: { email: message } };
      }

      refreshAdminView();
      return {
        ok: true,
        data: { email: outcome.email, createdAccount: outcome.createdAccount },
        message: outcome.createdAccount
          ? `${outcome.email} now has admin access. They haven’t signed in before, so an account was created for them: ask them to sign in with this address, then open the admin area.`
          : `${outcome.email} now has admin access. They’ll see the admin area the next time they open it while signed in.`,
      };
    },
    RATE_LIMIT,
  );
}

export interface RevokeAdminAccessResult {
  email: string;
}

/** Removes someone's admin access (never your own, never the last admin's). Input: { userId }. */
export async function revokeAdminAccess(input: unknown): Promise<AdminActionResult<RevokeAdminAccessResult>> {
  return withAdmin<RevokeAdminAccessResult>(
    "settings.admin.revoke",
    async (admin) => {
      const parsed = parseInput(revokeSchema, input);
      if (!parsed.ok) return parsed;

      let outcome;
      try {
        outcome = await revokeAdminRole({ userId: parsed.data.userId, actorId: admin.id });
      } catch (error) {
        if (!isMissingSchemaError(error)) throw error;
        logAdminError("settings.admin.revoke", error);
        return { ok: false, message: NEEDS_MIGRATION_MESSAGE };
      }

      if (!outcome.ok) {
        switch (outcome.reason) {
          case "self":
            return {
              ok: false,
              message: "You can’t remove your own admin access. Ask another admin to do it.",
            };
          case "last_admin":
            return {
              ok: false,
              message: "This is the only admin. Give someone else admin access first, then remove this one.",
            };
          case "actor_not_admin":
            return { ok: false, message: NOT_ADMIN_MESSAGE };
          case "not_admin":
            refreshAdminView();
            return {
              ok: false,
              message: "They no longer have admin access. Someone may have just removed it; the list has been updated.",
            };
        }
      }

      refreshAdminView();
      return {
        ok: true,
        data: { email: outcome.email },
        message: `${outcome.email} no longer has admin access. Their customer account and orders are unchanged.`,
      };
    },
    RATE_LIMIT,
  );
}
