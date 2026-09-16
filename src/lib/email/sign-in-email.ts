import "server-only";

import { EmailSignInError } from "@auth/core/errors";

import { siteConfig } from "@/config/site";

import { renderEmail } from "./layout";
import { sendEmail } from "./send";

/** Sign-in link lifetime, in seconds. Short, because the link is a key to the account. */
export const SIGN_IN_LINK_MAX_AGE = 60 * 60;

/** Auth.js's own endpoint that uses up an email sign-in token (the Resend provider's id is "resend"). */
export const SIGN_IN_CALLBACK_PATH = "/api/auth/callback/resend";

/** The link's lifetime in words: "an hour", "2 hours", "30 minutes". */
export function signInLinkLifetime(): string {
  const minutes = Math.round(SIGN_IN_LINK_MAX_AGE / 60);
  if (minutes === 60) return "an hour";
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

/**
 * The address the email actually links to. Auth.js's URL uses the token up on
 * the first GET, and mail security scanners (Outlook Safe Links, Mimecast,
 * Proofpoint…) open links before the customer does — so the email points at
 * our own page instead, which carries the same values into a "Sign in" button.
 * Only pressing it uses the token. Anything unexpected is left as Auth.js built it.
 */
export function signInConfirmationLink(authUrl: string): string {
  try {
    const url = new URL(authUrl);
    if (url.pathname !== SIGN_IN_CALLBACK_PATH) return authUrl;
    const confirm = new URL("/account/sign-in/confirm", url.origin);
    for (const key of ["callbackUrl", "token", "email"]) {
      const value = url.searchParams.get(key);
      if (value) confirm.searchParams.set(key, value);
    }
    return confirm.toString();
  } catch {
    return authUrl;
  }
}

/**
 * Auth.js `sendVerificationRequest` for the email provider: our branded sign-in
 * email. A failed send is raised as Auth.js's EmailSignInError, so the sign-in
 * form says the link couldn't be sent (and keeps the address) instead of
 * Auth.js treating it as a configuration fault.
 */
export async function sendSignInEmail({ identifier, url }: { identifier: string; url: string }): Promise<void> {
  const lifetime = signInLinkLifetime();
  const link = signInConfirmationLink(url);

  try {
    await sendEmail({
      to: identifier,
      subject: `Your sign-in link — ${siteConfig.name}`,
      html: renderEmail({
        preheader: `Sign in to ${siteConfig.name}. The link works once and expires after ${lifetime}.`,
        heading: "Sign in",
        bodyHtml: `<p style="margin:0">Tap the button to sign in to your ${siteConfig.name} account. No password needed.</p>`,
        cta: { label: "Sign in", url: link },
        footnote: `The link works once and expires after ${lifetime}. If you didn’t ask to sign in, you can ignore this email — nothing changes on your account.`,
      }),
      text: [
        `Sign in to ${siteConfig.name}`,
        "",
        `Open this link to sign in (it works once and expires after ${lifetime}):`,
        link,
        "",
        "If you didn't ask to sign in, you can ignore this email.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("[auth] could not send a sign-in email", error instanceof Error ? error.message : error);
    throw new EmailSignInError("The sign-in email could not be sent.");
  }
}
