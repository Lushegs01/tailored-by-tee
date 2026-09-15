import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { SIGN_IN_CALLBACK_PATH } from "@/lib/email/sign-in-email";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** Auth.js tokens are hex; anything else can't be one of ours. */
const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * Where the sign-in email's button leads. Opening this page uses nothing up — mail
 * security scanners that open links before the customer does see only a button.
 * Pressing it submits the link's values to Auth.js (a plain GET form, no
 * JavaScript, never submitted automatically), which uses the one-time token, signs
 * the customer in and returns them to where they started. Auth.js checks every
 * value itself, including that the return address is on this site.
 */
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/account/sign-in/confirm">) {
  const params = await searchParams;
  const token = param(params.token);
  const email = param(params.email);
  const callbackUrl = param(params.callbackUrl);
  const complete =
    TOKEN.test(token) && email.length > 2 && email.length <= 254 && email.includes("@") && callbackUrl.length <= 2048;

  return (
    <Container className="pt-12 pb-24 md:pt-20 md:pb-32">
      <div className="mx-auto max-w-md">
        <p className="text-eyebrow text-muted-foreground">Account</p>
        {complete ? (
          <>
            <h1 className="mt-4 font-display text-display-md">Sign in</h1>
            <p className="mt-5 text-body text-muted-foreground">
              You&rsquo;re signing in as <span className="break-all text-foreground">{email}</span>. Press the button to
              finish — the link works once.
            </p>
            <form method="get" action={SIGN_IN_CALLBACK_PATH} className="mt-10">
              {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="email" value={email} />
              <Button type="submit" size="lg" fullWidth>
                Sign in
              </Button>
            </form>
            <p className="mt-6 text-caption text-muted-foreground">
              Didn&rsquo;t ask to sign in? Close this page — nothing changes on your account.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-display-md">
              That link is <em className="italic">incomplete.</em>
            </h1>
            <p className="mt-5 text-body text-muted-foreground">
              Part of the sign-in link seems to be missing — some email apps shorten long links. Request a new one and
              open it straight from the email.
            </p>
            <TextLink href="/account/sign-in" className="mt-10">
              Back to sign in
            </TextLink>
          </>
        )}
      </div>
    </Container>
  );
}
