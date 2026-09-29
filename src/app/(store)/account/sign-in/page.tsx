import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { enabledSignInMethods } from "@/lib/auth/config";
import { getCurrentUser, recalledSignInReturn, safeReturnPath } from "@/lib/auth/session";
import { signInLinkLifetime } from "@/lib/email/sign-in-email";

import { signInWithGoogle } from "./actions";
import { EmailSignInForm } from "./email-sign-in-form";
import { GoogleSignInSubmit } from "./google-sign-in-submit";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** Auth.js error codes, in words a customer can act on. Unknown codes get the generic line. */
function errorMessage(code: string, emailOffered: boolean): string {
  switch (code) {
    case "Verification":
      return "That sign-in link has expired or has already been used. Request a new one below.";
    case "OAuthAccountNotLinked":
      return "That email is already linked to another sign-in method. Use the one you signed up with.";
    case "OAuthCallbackError":
      return "Google sign-in was cancelled or didn’t finish. Please try again.";
    case "AccessDenied":
      // Only Google is ever refused on this page: its email address wasn't confirmed by Google.
      return `We couldn’t sign you in with that Google account, as Google hasn’t confirmed its email address.${
        emailOffered ? " Try the email link instead." : ""
      }`;
    case "Configuration":
      return "Sign-in isn’t available right now. Please try again soon.";
    default:
      return "We couldn’t sign you in. Please try again.";
  }
}

export default async function SignInPage({ searchParams }: PageProps<"/account/sign-in">) {
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const requested = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  // Auth.js's error redirects drop the return path; the sign-in action remembered it.
  const callbackUrl = safeReturnPath(requested ?? (errorCode ? await recalledSignInReturn() : undefined));
  if (await getCurrentUser()) redirect(callbackUrl);

  const { google, email } = enabledSignInMethods;
  const error = errorCode ? errorMessage(errorCode, email) : null;

  return (
    <Container className="pt-12 pb-24 md:pt-20 md:pb-32">
      <div className="mx-auto max-w-md">
        <p className="text-eyebrow text-muted-foreground">Account</p>
        <h1 className="mt-4 font-display text-display-md">Sign in</h1>
        <p className="mt-5 text-body text-muted-foreground">
          No password needed. Your account keeps your orders, addresses and saved pieces in one place — and the same
          link creates one if you&rsquo;re new.
        </p>

        {error ? (
          <p role="alert" className="mt-8 border border-danger/40 px-4 py-3 text-body-sm">
            {error}
          </p>
        ) : null}

        {google || email ? (
          <div className="mt-10 space-y-8">
            {google ? (
              <form action={signInWithGoogle}>
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <GoogleSignInSubmit />
              </form>
            ) : null}

            {google && email ? (
              <div className="flex items-center gap-4 text-caption text-muted-foreground" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}

            {email ? <EmailSignInForm callbackUrl={callbackUrl} linkLifetime={signInLinkLifetime()} /> : null}
          </div>
        ) : (
          <p className="mt-10 border px-4 py-3 text-body-sm">
            Accounts are nearly ready. You can still check out as a guest — your order page link keeps track of it.
          </p>
        )}

        <div className="mt-12 border-t pt-8">
          <p className="text-body-sm text-muted-foreground">Just want to shop? You never need an account to buy.</p>
          <TextLink href="/shop" className="mt-4">
            Continue shopping
          </TextLink>
        </div>
      </div>
    </Container>
  );
}
