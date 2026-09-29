"use client";

import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/(store)/account/sign-in/actions";
import { cn } from "@/lib/utils";

/** Ends the session on the server (the existing account sign-out), then the site goes to the homepage. */
export function AdminSignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
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
        "inline-flex min-h-10 items-center text-body-sm text-foreground transition-opacity duration-200 disabled:opacity-60",
      )}
    >
      <span className="link-underline-static pb-0.5">{pending ? "Signing outâ€¦" : "Sign out"}</span>
    </button>
  );
}
