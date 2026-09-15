import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountNav } from "@/components/account/account-nav";
import { SignOutButton } from "@/components/account/sign-out-button";
import { Container } from "@/components/ui/container";
import { getCurrentUser, signInPath } from "@/lib/auth/session";

// Every page in here is private. Pages set their own titles (and repeat this, belt and braces).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function firstName(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/**
 * The frame around every signed-in account page: greeting, navigation and
 * sign-out. The sign-in pages sit outside this route group and are never
 * wrapped. Pages render their own content column (an h1 and sections) without
 * a Container or an "Account" eyebrow — both live here.
 */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  // Layouts and pages render in parallel, so each page checks too; this keeps the frame itself private.
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/account"));

  const first = firstName(user.name);

  return (
    <Container className="pt-10 pb-24 md:pt-16 md:pb-32">
      <div>
        <p className="text-eyebrow text-muted-foreground">Account</p>
        <p className="mt-4 font-display text-display-md break-words">
          {first ? (
            <>
              Hello, <em className="italic">{first}.</em>
            </>
          ) : (
            "Hello."
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6">
          <p className="min-w-0 py-3 text-body-sm break-words text-muted-foreground">{user.email}</p>
          {/* From lg, sign-out sits at the foot of the navigation rail instead. */}
          <SignOutButton className="lg:hidden" />
        </div>
      </div>

      <div className="mt-6 lg:mt-12 lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
        <AccountNav className="lg:col-span-3" />
        <div className="mt-10 min-w-0 lg:col-span-9 lg:mt-0">{children}</div>
      </div>
    </Container>
  );
}
