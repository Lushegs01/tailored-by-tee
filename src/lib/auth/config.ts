import "server-only";

import { isDatabaseConfigured } from "@/lib/db";

/*
 * Whether customer accounts can work on this deployment, decided once from
 * configuration — never from a visitor's session — so static pages can read it.
 *
 * Accounts need all of: a secret to sign sessions with (AUTH_SECRET), a database
 * to keep them in, and at least one way to sign in. Without any one of them the
 * site behaves as it did before accounts: guest checkout only, no sign-in offered,
 * and nothing in the browser asks /api/auth/session (which would fail).
 *
 * Changing these variables needs a redeploy, as any environment change does.
 */

const hasSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
const accountsBase = hasSecret && isDatabaseConfigured();

const googleKeys = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
// Resend's shared test sender only delivers to the Resend account's owner, so in
// production email sign-in waits for a verified sender (EMAIL_FROM).
const emailKeys =
  Boolean(process.env.RESEND_API_KEY) && (process.env.NODE_ENV !== "production" || Boolean(process.env.EMAIL_FROM));

/** Which sign-in methods are switched on, for the sign-in page, its actions and Auth.js itself. */
export const enabledSignInMethods = {
  google: accountsBase && googleKeys,
  email: accountsBase && emailKeys,
};

/** True when a customer can actually sign in. Everything account-related hides when false. */
export const accountsEnabled = enabledSignInMethods.google || enabledSignInMethods.email;

/* One clear line in the production logs when accounts are half-configured, rather than an error per request. */
const globalForAuth = globalThis as typeof globalThis & { __tbtAuthConfigLogged?: boolean };
if (process.env.NODE_ENV === "production" && !globalForAuth.__tbtAuthConfigLogged) {
  globalForAuth.__tbtAuthConfigLogged = true;
  const providersConfigured = googleKeys || Boolean(process.env.RESEND_API_KEY);
  if (providersConfigured && !hasSecret) {
    console.error("[auth] Sign-in keys are set but AUTH_SECRET is not, so accounts are switched off. Set AUTH_SECRET and redeploy.");
  } else if (providersConfigured && !isDatabaseConfigured()) {
    console.error("[auth] Sign-in keys are set but DATABASE_URL is not, so accounts are switched off.");
  }
  if (process.env.RESEND_API_KEY && !process.env.EMAIL_FROM) {
    console.warn("[auth] RESEND_API_KEY is set without EMAIL_FROM, so email sign-in is off. Set EMAIL_FROM to a verified sender.");
  }
}
