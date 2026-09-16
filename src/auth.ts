import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { authAdapter } from "@/lib/auth/adapter";
import { isVerifiedGoogleProfile, publicSession, signInEmailLimitKey } from "@/lib/auth/callbacks";
import { enabledSignInMethods } from "@/lib/auth/config";
import { SIGN_IN_LINK_MAX_AGE, sendSignInEmail } from "@/lib/email/sign-in-email";
import { emailFrom } from "@/lib/email/send";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * Accounts (Auth.js v5). Customers sign in with a one-time email link or with
 * Google — no passwords to leak or forget. Guest checkout never needs any of this.
 *
 * - Providers switch on only when accounts are fully configured (lib/auth/config:
 *   AUTH_SECRET, a database, and each provider's keys), so the site builds and
 *   runs without them.
 * - Sessions live in the database, so signing out (or deleting a session) ends
 *   it everywhere at once.
 * - Every sign-in method must prove the customer controls the email address:
 *   orders are visible by email (lib/orders/queries). Email links do by being
 *   delivered; Google identities are refused in the signIn callback below unless
 *   Google reports the address as verified. Only then may Google attach to an
 *   existing email-link account with the same address.
 * - Sign-in links are rate-limited in that same callback, which every path to
 *   sending one passes through (the server action calls Auth.js in-process; the
 *   public POST endpoint is closed in the route handler as well).
 */

const providers: Provider[] = [];

if (enabledSignInMethods.google) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

if (enabledSignInMethods.email) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: emailFrom(),
      maxAge: SIGN_IN_LINK_MAX_AGE,
      sendVerificationRequest: ({ identifier, url }) => sendSignInEmail({ identifier, url }),
    }),
  );
}

const SIGN_IN_LINK_WINDOW_MS = 10 * 60_000;

/**
 * Per address (10), per inbox (3, "+tags" counted together) and per instance
 * (300) in ten minutes. Refusing here stops Auth.js before it writes a token or
 * sends anything; the action reports it as "too many links".
 */
async function withinSignInLinkLimits(email: string): Promise<boolean> {
  const address = await clientAddress();
  return (
    rateLimit(`signin-link:ip:${address}`, { limit: 10, windowMs: SIGN_IN_LINK_WINDOW_MS }).ok &&
    rateLimit(`signin-link:email:${signInEmailLimitKey(email)}`, { limit: 3, windowMs: SIGN_IN_LINK_WINDOW_MS }).ok &&
    rateLimit("signin-link:all", { limit: 300, windowMs: SIGN_IN_LINK_WINDOW_MS }).ok
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter(),
  providers,
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: {
    signIn: "/account/sign-in",
    verifyRequest: "/account/sign-in/check-email",
    error: "/account/sign-in",
  },
  trustHost: true,
  callbacks: {
    async signIn({ user, account, profile, email }) {
      // Refusing raises AccessDenied: no account is linked or created, no link is sent.
      if (account?.provider === "google") return isVerifiedGoogleProfile(profile);
      if (email?.verificationRequest) return withinSignInLinkLimits(user.email ?? account?.providerAccountId ?? "");
      return true;
    },
    session({ session, user }) {
      return publicSession(session, user);
    },
  },
});
