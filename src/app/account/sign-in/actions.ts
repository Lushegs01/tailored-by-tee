"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { accountsEnabled, enabledSignInMethods } from "@/lib/auth/config";
import { rememberSignInReturn, safeReturnPath } from "@/lib/auth/session";

/*
 * Sign-in and sign-out. Auth.js does the cryptography (one-time tokens, CSRF,
 * session cookies); these actions add input validation and a same-site return
 * path. The limits that stop anyone flooding an inbox with links are enforced
 * inside Auth.js's signIn callback (src/auth.ts), which every path to sending a
 * link goes through; a refusal there comes back here as AccessDenied.
 * Replies never reveal whether an address has an account.
 */

export interface EmailSignInState {
  status: "idle" | "error";
  message?: string;
  email?: string;
  /** Set when the message is about the address itself (so only then is the field marked invalid). */
  field?: "email";
}

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const COULD_NOT_SEND = "We couldn’t send your link just now. Please try again.";

/** Auth.js answers a sent link with its "check your inbox" step; anything else is an error page. */
function reachedInboxStep(destination: unknown): boolean {
  if (typeof destination !== "string") return false;
  try {
    return new URL(destination, "http://localhost").pathname.endsWith("/verify-request");
  } catch {
    return false;
  }
}

export async function signInWithEmail(_previous: EmailSignInState, formData: FormData): Promise<EmailSignInState> {
  if (!enabledSignInMethods.email) {
    return { status: "error", message: "Email sign-in isn’t available yet. Please try again soon." };
  }

  const raw = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", email: raw, field: "email" };
  const email = parsed.data;
  const returnPath = safeReturnPath(formData.get("callbackUrl"));

  let destination: unknown;
  try {
    await rememberSignInReturn(returnPath);
    destination = await signIn("resend", { email, redirectTo: returnPath, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "AccessDenied") {
        return { status: "error", message: "Too many sign-in links requested. Please wait a few minutes.", email };
      }
      console.error("[auth] email sign-in failed", error.type);
      return { status: "error", message: COULD_NOT_SEND, email };
    }
    throw error;
  }

  if (!reachedInboxStep(destination)) {
    console.error("[auth] email sign-in did not reach the inbox step");
    return { status: "error", message: COULD_NOT_SEND, email };
  }
  // Carries the return path, so "Back to sign in" there still leads back to it.
  redirect(`/account/sign-in/check-email?callbackUrl=${encodeURIComponent(returnPath)}`);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!enabledSignInMethods.google) return;
  const returnPath = safeReturnPath(formData.get("callbackUrl"));
  await rememberSignInReturn(returnPath);
  await signIn("google", { redirectTo: returnPath });
}

export async function signOutAction(): Promise<void> {
  // Without accounts there is no session to end (and Auth.js would only report its configuration).
  if (!accountsEnabled) redirect("/");
  await signOut({ redirectTo: "/" });
}
