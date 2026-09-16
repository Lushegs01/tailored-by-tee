/*
 * The decisions in settling a Paystack payment, kept free of the database so
 * they can be tested on their own. payments.ts applies them.
 */

/** What settling one payment reference did. */
export type SettleOutcome =
  | "paid"
  | "paid_after_release"
  | "already_paid"
  | "needs_refund"
  | "rejected"
  | "failed"
  | "abandoned"
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

/** How long an earlier payment that Paystack still reports as going through holds back a new checkout. */
export const PAYMENT_IN_PROGRESS_MS = 15 * 60_000;

/**
 * Whether an earlier payment attempt, just re-checked with Paystack, should stop
 * a new checkout opening for the same order: Paystack says it is still going
 * through (a bank transfer clearing, a card at its one-time-code step) and it
 * started recently — a second checkout could charge the customer twice. An older
 * attempt left "in progress" doesn't block, so a customer who walked away from
 * one can still pay.
 */
export function paymentStillInProgress(outcome: SettleOutcome, startedAt: Date, now: Date): boolean {
  return outcome === "pending" && now.getTime() - startedAt.getTime() < PAYMENT_IN_PROGRESS_MS;
}
