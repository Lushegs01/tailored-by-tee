"use client";

import { getSession } from "next-auth/react";
import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/account/sign-in/actions";
import { cn } from "@/lib/utils";

/*
 * Signing out happens on the server (signOutAction clears the session and
 * redirects home). The client session that the header reads (useAccount) would
 * otherwise stay "signed in" until the tab next regains focus, so once the
 * action has finished we ask next-auth/react to re-read it: getSession()
 * broadcasts on a fresh BroadcastChannel, which the SessionProvider in this tab
 * — and in any other open tab — answers by refetching.
 */
async function signOutAndRefresh() {
  try {
    await signOutAction();
  } finally {
    // Also runs when the action's redirect rejects this promise; the redirect then carries on as normal.
    void getSession();
  }
}

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAndRefresh} className={className}>
      <SignOutSubmit />
    </form>
  );
}

function SignOutSubmit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex min-h-11 items-center text-body-sm text-foreground",
        "transition-opacity duration-300 ease-editorial disabled:opacity-60",
      )}
    >
      <span className="link-underline-static pb-0.5">{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
