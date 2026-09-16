"use client";

import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/account/sign-in/actions";
import { useRefreshAccount } from "@/components/account/use-account";
import { clearCheckoutDraft } from "@/components/checkout/checkout-draft";
import { useWishlistStatus } from "@/components/wishlist/wishlist-provider";
import { cn } from "@/lib/utils";

/*
 * Signing out happens on the server (signOutAction clears the session and
 * redirects home). Once the action has finished, this browser forgets what the
 * account left in it — its wishlist, and the checkout details kept for this tab —
 * so on a shared device the next person never sees them. Then the session is
 * read again, in this tab and any other open one, so the header stops saying
 * "signed in" (other tabs confirm the sign-out with the server and forget the
 * wishlist too).
 */
export function SignOutButton({ className }: { className?: string }) {
  const refreshAccount = useRefreshAccount();
  const { forgetAccount } = useWishlistStatus();

  async function signOutAndForget() {
    try {
      await signOutAction();
    } finally {
      // Also runs when the action's redirect rejects this promise; the redirect then carries on as normal.
      forgetAccount();
      clearCheckoutDraft();
      void refreshAccount();
    }
  }

  return (
    <form action={signOutAndForget} className={className}>
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
