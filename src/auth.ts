import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { authAdapter } from "@/lib/auth/adapter";
import { SIGN_IN_LINK_MAX_AGE, sendSignInEmail } from "@/lib/email/sign-in-email";
import { emailFrom } from "@/lib/email/send";

/*
 * Accounts (Auth.js v5). Customers sign in with a one-time email link or with
 * Google — no passwords to leak or forget. Guest checkout never needs any of this.
 *
 * - Providers switch on only when their keys are present (RESEND_API_KEY;
 *   AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET), so the site builds and runs without them.
 * - Sessions live in the database, so signing out (or deleting a session) ends
 *   it everywhere at once.
 * - Google may attach to an existing email-link account with the same address:
 *   Google verifies its users' email addresses, which is the case Auth.js
 *   documents as safe for automatic linking. Email links prove ownership too.
 */

/** Which sign-in methods are switched on, for the sign-in page and actions. */
export const enabledSignInMethods = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  email: Boolean(process.env.RESEND_API_KEY),
};

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
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role ?? "CUSTOMER";
      return session;
    },
  },
});
