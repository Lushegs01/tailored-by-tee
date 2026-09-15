import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AccountNav } from "@/components/account/account-nav";
import { SignOutButton } from "@/components/account/sign-out-button";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
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
 *
 * The frame itself renders at once; only the greeting waits for the session, in
 * its own Suspense boundary. So the account's own skeleton (loading.tsx, in the
 * content column) is what shows while a page loads — never the shop's.
 * Signed-out visitors are redirected before this renders (src/proxy.ts), and
 * every page checks the session itself.
 */
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <Container className="pt-10 pb-24 md:pt-16 md:pb-32">
      <div>
        <p className="text-eyebrow text-muted-foreground">Account</p>
        <Suspense fallback={<GreetingSkeleton />}>
          <AccountGreeting />
        </Suspense>
      </div>

      <div className="mt-6 lg:mt-12 lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
        <AccountNav className="lg:col-span-3" />
        <div className="mt-10 min-w-0 lg:col-span-9 lg:mt-0">{children}</div>
      </div>
    </Container>
  );
}

async function AccountGreeting() {
  // Layouts and pages render in parallel, so each page checks too; this keeps the greeting itself private.
  const user = await getCurrentUser();
  if (!user) redirect(signInPath("/account"));

  const first = firstName(user.name);

  return (
    <>
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
    </>
  );
}

/** The greeting's geometry: the serif line, then the email row. */
function GreetingSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mt-4 h-10 w-56 max-w-full md:h-12 md:w-72" />
      <div className="mt-4 flex min-h-11 items-center">
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
    </div>
  );
}
