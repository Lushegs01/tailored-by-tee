import "server-only";

import { siteConfig } from "@/config/site";

import { renderEmail } from "./layout";
import { sendEmail } from "./send";

/** Sign-in link lifetime, in seconds. Short, because the link is a key to the account. */
export const SIGN_IN_LINK_MAX_AGE = 60 * 60;

/** Auth.js `sendVerificationRequest` for the email provider: our branded sign-in email. */
export async function sendSignInEmail({ identifier, url }: { identifier: string; url: string }): Promise<void> {
  const minutes = Math.round(SIGN_IN_LINK_MAX_AGE / 60);

  await sendEmail({
    to: identifier,
    subject: `Your sign-in link — ${siteConfig.name}`,
    html: renderEmail({
      preheader: `Sign in to ${siteConfig.name}. The link works once and expires in ${minutes} minutes.`,
      heading: "Sign in",
      bodyHtml: `<p style="margin:0">Tap the button to sign in to your ${siteConfig.name} account. No password needed.</p>`,
      cta: { label: "Sign in", url },
      footnote: `The link works once and expires in ${minutes} minutes. If you didn’t ask to sign in, you can ignore this email — nothing changes on your account.`,
    }),
    text: [
      `Sign in to ${siteConfig.name}`,
      "",
      `Open this link to sign in (it works once and expires in ${minutes} minutes):`,
      url,
      "",
      "If you didn't ask to sign in, you can ignore this email.",
    ].join("\n"),
  });
}
