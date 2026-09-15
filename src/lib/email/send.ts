import "server-only";

import { siteConfig } from "@/config/site";

/*
 * Transactional email through Resend's REST API — sign-in links and order
 * emails. One key (RESEND_API_KEY); without it nothing is sent and callers
 * decide what that means (sign-in by email is simply not offered).
 */

const RESEND_API = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * The sender. Resend's shared test sender (onboarding@resend.dev) only delivers
 * to the Resend account's own address; set EMAIL_FROM on a verified domain to
 * email customers.
 */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || `${siteConfig.name} <onboarding@resend.dev>`;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend ignores a repeat with the same key for 24 hours — safe retries, no double sends. */
  idempotencyKey?: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: emailFrom(), to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend responded ${response.status}${detail ? `: ${detail}` : ""}`);
  }
}
