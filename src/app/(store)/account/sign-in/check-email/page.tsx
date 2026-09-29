import type { Metadata } from "next";

import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { safeReturnPath, signInPath } from "@/lib/auth/session";
import { signInLinkLifetime } from "@/lib/email/sign-in-email";

export const metadata: Metadata = {
  title: "Check your inbox",
  robots: { index: false, follow: false },
};

/**
 * Shown after a sign-in link is requested. Says the same thing whether or not the
 * address has an account, and never carries the address itself in its URL.
 */
export default async function CheckEmailPage({ searchParams }: PageProps<"/account/sign-in/check-email">) {
  const { callbackUrl } = await searchParams;
  // Requesting another link from here should still lead back to where sign-in began.
  const backToSignIn = signInPath(safeReturnPath(typeof callbackUrl === "string" ? callbackUrl : undefined));

  return (
    <Container className="pt-12 pb-24 md:pt-20 md:pb-32">
      <div className="mx-auto max-w-md">
        <p className="text-eyebrow text-muted-foreground">Account</p>
        <h1 className="mt-4 font-display text-display-md">
          Check your <em className="italic">inbox.</em>
        </h1>
        <p className="mt-5 text-body text-muted-foreground">
          We&rsquo;ve sent you a sign-in link. Open it on this device to sign in — it works once and expires after{" "}
          {signInLinkLifetime()}.
        </p>
        <div className="mt-12 border-t pt-8">
          <p className="text-body-sm text-muted-foreground">
            Nothing yet? Check your spam or promotions folder, or request a new link.
          </p>
          <TextLink href={backToSignIn} className="mt-4">
            Back to sign in
          </TextLink>
        </div>
      </div>
    </Container>
  );
}
