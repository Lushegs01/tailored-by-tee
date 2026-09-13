"use server";

import { z } from "zod";

/**
 * Journal sign-up. Validates on the server regardless of what the browser
 * checked, and never logs the address.
 */

export interface NewsletterState {
  status: "idle" | "success" | "error";
  message: string;
  /** The submitted address, echoed back on error so the field keeps it. */
  email?: string;
}

/** Form field that people never see; anything in it means a bot filled the form. */
const HONEYPOT = "website";

const emailSchema = z
  .email({ error: "Please enter a valid email address." })
  .max(254, { error: "That email address is too long." });

const SUCCESS_MESSAGE = "Thank you — you’re on the list.";

export async function subscribeToNewsletter(
  _previous: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim() : "";

  // Answer bots exactly as we answer people, so the trap isn't advertised.
  const trap = formData.get(HONEYPOT);
  if (typeof trap !== "string" || trap !== "") {
    return { status: "success", message: SUCCESS_MESSAGE };
  }

  if (email === "") {
    return { status: "error", message: "Please enter your email address.", email };
  }

  const result = emailSchema.safeParse(email);
  if (!result.success) {
    return {
      status: "error",
      message: result.error.issues[0]?.message ?? "Please enter a valid email address.",
      email,
    };
  }

  // TODO(phase-8): persist to the mailing-list provider with double opt-in
  // (normalised address, consent timestamp, source "home:journal").

  return { status: "success", message: SUCCESS_MESSAGE };
}
