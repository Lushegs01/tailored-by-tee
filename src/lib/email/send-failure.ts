/*
 * What a failed send means for trying it again, kept free of server-only imports
 * so it can be tested on its own. send.ts raises the error; order-emails.ts acts on it.
 */

/** Resend refused a send. `code` is Resend's error name ("validation_error"…), when its reply gave one. */
export class EmailSendError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.code = code;
  }
}

/** Resend's error name from its JSON reply ({ statusCode, name, message }); null for anything else. */
export function resendErrorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "name" in parsed && typeof parsed.name === "string") {
      return parsed.name.slice(0, 64);
    }
  } catch {
    // Not JSON: no code.
  }
  return null;
}

/**
 * - "permanent": the same email will be refused again however often it is sent —
 *   a 4xx such as a malformed request (400) or a bad address (422). Retrying only
 *   crowds out other emails.
 * - "already_sent": an earlier send with the same idempotency key went through, and
 *   this one's content differs (the order or the wording changed in between, say):
 *   Resend won't send it again (409), and the customer already has the email.
 * - "in_progress": another send with the same idempotency key is still under way,
 *   and that one decides.
 * - "temporary": anything else — Resend down or slow (5xx, a timeout, no answer),
 *   rate limits and quotas (429), a request timeout (408), a locked resource (409).
 *   Also refusals of the site's Resend account rather than of the email (401, 403: a
 *   wrong or revoked API key, an unverified sender), which every email meets until
 *   the set-up is put right — marking each one refused would lose them all for
 *   good. Worth another try later; the caller's own time limit stops the retries.
 */
export type SendFailureKind = "permanent" | "already_sent" | "in_progress" | "temporary";

export function sendFailureKind(error: unknown): SendFailureKind {
  if (!(error instanceof EmailSendError)) return "temporary";
  const { status, code } = error;
  if (status === 409 && code === "concurrent_idempotent_requests") return "in_progress";
  if (status === 409 && code === "invalid_idempotent_request") return "already_sent";
  if (status === 409 && code === "resource_locked") return "temporary";
  if (status === 401 || status === 403) return "temporary";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "permanent";
  return "temporary";
}
