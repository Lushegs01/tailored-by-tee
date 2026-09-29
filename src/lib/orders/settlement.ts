/*
 * The decisions in settling a Paystack payment, kept free of the database so
 * they can be tested on their own. payments.ts applies them.
 */

/**
 * What settling one payment reference did. Of the unfinished ones, "awaiting_customer"
 * means Paystack is waiting on the shopper (a one-time code, a bank transfer not yet
 * seen) and "pending" that the payment itself is going through.
 */
export type SettleOutcome =
  | "paid"
  | "paid_after_release"
  | "already_paid"
  | "needs_refund"
  | "rejected"
  | "failed"
  | "abandoned"
  | "awaiting_customer"
  | "pending"
  | "unknown_reference";

/**
 * What a confirmed payment, once claimed, does to its order — decided by the
 * order's status at that moment:
 * - "promote": the order still holds its pieces for this payment (PENDING — also
 *   past its deadline, if no sweep has released it yet): sell them, mark it paid;
 * - "after_release": the hold was released (CANCELLED): keep the sale only if
 *   every piece is still free, otherwise flag a refund;
 * - "duplicate": another payment already paid for it: flag this one for a refund.
 *
 * A promote that finds the order already released (a sweep won the race) re-reads
 * the status and asks again, so a late payment is never mistaken for a duplicate.
 * Taking a released order back is conditional too: of two late payments racing for
 * it, the one that finds it already taken re-reads it as paid — a duplicate.
 */
export type SettlementPath = "promote" | "after_release" | "duplicate";

export function settlementPath(status: string): SettlementPath {
  if (status === "PENDING") return "promote";
  if (status === "CANCELLED") return "after_release";
  return "duplicate";
}

/**
 * Whether settling should see to the order confirmation email. The call that
 * paid the order always does. So does any later one that finds it already paid
 * (a webhook redelivery, the shopper's return, a retry): the email is recorded
 * on the order once it has gone, and a recorded one is never sent again, so this
 * is how a send that failed the first time gets another chance.
 */
export function confirmationEmailDue(outcome: SettleOutcome): boolean {
  return outcome === "paid" || outcome === "paid_after_release" || outcome === "already_paid";
}

/** How long after it started an earlier payment Paystack reports as going through holds back a new checkout. */
export const PAYMENT_IN_PROGRESS_MS = 5 * 60_000;

/**
 * The same for one where Paystack is waiting on the shopper. Shorter: usually they
 * have walked away from a one-time code, and a transfer they did send is normally
 * seen within a minute or two, after which it is "pending" or paid.
 */
export const AWAITING_CUSTOMER_MS = 3 * 60_000;

/**
 * How long an earlier payment attempt, just re-checked with Paystack, stops a new
 * checkout opening for the same order — 0 when it doesn't. Only an attempt that
 * may still take the customer's money blocks, and only for a few minutes after it
 * started: long enough that a second checkout doesn't charge them twice, short
 * enough that someone who walked away from one can soon pay. (A second payment
 * that got through anyway is still recognised when it settles, and flagged for a refund.)
 */
export function paymentRetryDelay(outcome: SettleOutcome, startedAt: Date, now: Date): number {
  const blocksFor =
    outcome === "pending"
      ? PAYMENT_IN_PROGRESS_MS
      : outcome === "awaiting_customer"
        ? AWAITING_CUSTOMER_MS
        : 0;
  return Math.max(0, startedAt.getTime() + blocksFor - now.getTime());
}

/** What the shopper is told while an earlier payment blocks a new one: when to look again, rounded up. */
export function paymentInProgressMessage(delayMs: number): string {
  const minutes = Math.max(1, Math.ceil(delayMs / 60_000));
  const when = minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  return `Your last payment is still being confirmed. Please refresh this page in ${when} — if it hasn’t gone through by then, you can try again.`;
}
