"use client";

import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/account/sign-in/actions";
import { useRefreshAccount } from "@/components/account/use-account";
import { useWishlistStatus } from "@/components/wishlist/wishlist-provider";
import { cn } from "@/lib/utils";

/*
 * Signing out happens on the server (signOutAction clears the session and
 * redirects home). Once the action has finished, this browser forgets the
 * account's wishlist straight away — so on a shared device the next person never
 * sees it — and the session is read again, in this tab and any other open one,
 * so the header stops saying "signed in". If the sign-out somehow failed, the
 * wishlist simply syncs the account's list again.
 */
export function SignOutButton({ className }: { className?: string }) {
  const refreshAccount = useRefreshAccount();
  const { forgetAccount } = useWishlistStatus();

  async function signOutAndRefresh() {
    try {
      await signOutAction();
    } finally {
      // Also runs when the action's redirect rejects this promise; the redirect then carries on as normal.
      forgetAccount();
      refreshAccount();
    }
  }

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
