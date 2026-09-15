"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { enabledSignInMethods, signIn, signOut } from "@/auth";
import { safeReturnPath } from "@/lib/auth/session";
import { clientAddress, rateLimit } from "@/lib/security/rate-limit";

/*
 * Sign-in and sign-out. Auth.js does the cryptography (one-time tokens, CSRF,
 * session cookies); these actions add what it doesn't: input validation, a
 * same-site return path, and limits so no one can flood an inbox with links.
 * Replies never reveal whether an address has an account.
 */

export interface EmailSignInState {
  status: "idle" | "error";
  message?: string;
  email?: string;
}

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export async function signInWithEmail(_previous: EmailSignInState, formData: FormData): Promise<EmailSignInState> {
  if (!enabledSignInMethods.email) {
    return { status: "error", message: "Email sign-in isn’t available yet. Please try again soon." };
  }

  const raw = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", email: raw };
  const email = parsed.data;

  const address = await clientAddress();
  const perAddress = rateLimit(`signin-ip:${address}`, { limit: 10, windowMs: 10 * 60_000 });
  const perEmail = rateLimit(`signin-email:${email}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!perAddress.ok || !perEmail.ok) {
    return { status: "error", message: "Too many sign-in links requested. Please wait a few minutes.", email };
  }

  try {
    // Redirects to the "check your inbox" page (a thrown NEXT_REDIRECT, which must propagate).
    await signIn("resend", { email, redirectTo: safeReturnPath(formData.get("callbackUrl")) });
  } catch (error) {
    if (error instanceof AuthError) {
      console.error("[auth] email sign-in failed", error.type);
      return { status: "error", message: "We couldn’t send your link just now. Please try again.", email };
    }
    throw error;
  }
  return { status: "idle" };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!enabledSignInMethods.google) return;
  await signIn("google", { redirectTo: safeReturnPath(formData.get("callbackUrl")) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
