import Link from "next/link";
import type { ReactNode } from "react";

import { Stat, StatGrid } from "@/components/admin/ui";
import { siteConfig } from "@/config/site";
import { formatNumber } from "@/lib/admin/format";
import type { Loaded, WorkQueue } from "@/lib/admin/metrics";

import { countNoun } from "./copy";
import { ORDERS_PATH, PENDING_REVIEWS_HREF, orderHref, ordersWithStatusHref } from "./links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * "Needs attention": what is waiting on the owner right now, whatever period the
 * sales below show. Each figure opens the list where it can be dealt with; orders
 * that need money sent back (refunds due, paid twice) are also linked one by one,
 * since they're easy to lose among ordinary cancelled orders.
 */
export async function AttentionSection({ queue }: { queue: Promise<Loaded<WorkQueue>> }) {
  const result = await queue;

  return (
    <section aria-labelledby="overview-attention" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="overview-attention" className="text-label">
          Needs attention
        </h2>
        {result.ok ? <p className="text-caption text-muted-foreground">{summary(result.data)}</p> : null}
      </div>

      {result.ok ? (
        <AttentionFigures queue={result.data} />
      ) : (
        <div className="border bg-background-raised">
          <SectionUnavailable reason={result.reason} what="These figures" />
        </div>
      )}
    </section>
  );
}

function summary(queue: WorkQueue): string {
  const toFulfil = queue.toPrepare + queue.readyToShip;
  return toFulfil > 0 ? `${countNoun(toFulfil, "order")} to fulfil` : "No orders to fulfil right now";
}

function AttentionFigures({ queue }: { queue: WorkQueue }) {
  const holdMinutes = siteConfig.commerce.reservationMinutes;
  const refundsDueHref =
    queue.refundsDue === 1 && queue.refundsDueNumbers[0]
      ? orderHref(queue.refundsDueNumbers[0])
      : ordersWithStatusHref("CANCELLED");

  return (
    <div className="space-y-3">
      {queue.refundsDue > 0 ? (
        <Alert
          title={
            queue.refundsDue === 1
              ? "A cancelled order was paid and needs a refund"
              : `${formatNumber(queue.refundsDue)} cancelled orders were paid and need refunds`
          }
          numbers={queue.refundsDueNumbers}
          listLabel="Orders to refund"
          total={queue.refundsDue}
          moreHref={ordersWithStatusHref("CANCELLED")}
        >
          {queue.refundsDue === 1
            ? "The payment arrived after the order was cancelled — usually after the hold ended and the pieces sold. Open the order to refund it through Paystack."
            : "The payments arrived after the orders were cancelled — usually after the hold ended and the pieces sold. Open each order to refund it through Paystack."}
          {queue.refundsInProgress > 0
            ? ` ${queue.refundsInProgress === 1 ? "One is" : `${formatNumber(queue.refundsInProgress)} are`} already with Paystack.`
            : null}
        </Alert>
      ) : null}

      {queue.paidTwice > 0 ? (
        <Alert
          title={
            queue.paidTwice === 1
              ? "An order was paid twice"
              : `${formatNumber(queue.paidTwice)} orders were paid twice`
          }
          numbers={queue.paidTwiceNumbers}
          listLabel="Orders paid twice"
          total={queue.paidTwice}
          moreHref={ORDERS_PATH}
        >
          The customer completed more than one payment for the same order. Keep one and refund the extra payment
          through Paystack from the order page.
        </Alert>
      ) : null}

      {/* Two across even on the narrowest phones: these are short counts, unlike money. */}
      <StatGrid className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="To prepare"
          value={formatNumber(queue.toPrepare)}
          hint="Paid, not packed yet"
          href={ordersWithStatusHref("PAID")}
        />
        <Stat
          label="Ready to ship"
          value={formatNumber(queue.readyToShip)}
          hint="Packed, waiting for the courier"
          href={ordersWithStatusHref("PROCESSING")}
        />
        <Stat
          label="Awaiting payment"
          value={formatNumber(queue.awaitingPayment)}
          hint={`Pieces held up to ${holdMinutes} minutes while the customer pays`}
          href={ordersWithStatusHref("PENDING")}
        />
        <Stat
          label="Refunds due"
          value={<span className={queue.refundsDue > 0 ? "text-danger" : undefined}>{formatNumber(queue.refundsDue)}</span>}
          hint={
            queue.refundsDue === 0
              ? "Cancelled orders that were paid"
              : queue.refundsInProgress > 0
                ? `${formatNumber(queue.refundsInProgress)} in progress with Paystack`
                : "Refund through Paystack"
          }
          href={refundsDueHref}
        />
        <Stat
          label="Reviews to approve"
          value={formatNumber(queue.reviewsPending)}
          hint="Hidden in the store until you approve them"
          href={PENDING_REVIEWS_HREF}
          className="col-span-2 xl:col-span-1"
        />
      </StatGrid>
    </div>
  );
}

/** Something that has gone wrong with money, with a direct link to each order. */
function Alert({
  title,
  numbers,
  listLabel,
  total,
  moreHref,
  children,
}: {
  title: string;
  /** Up to five order numbers, newest first. */
  numbers: string[];
  /** Names the list of order links for screen readers. */
  listLabel: string;
  total: number;
  moreHref: string;
  children: ReactNode;
}) {
  const more = total - numbers.length;

  return (
    <div className="border border-danger/50 bg-background-raised px-4 py-3 md:px-5">
      <p className="flex items-start gap-2 text-body-sm font-medium text-danger">
        <span aria-hidden="true" className="mt-[0.5em] size-1.5 shrink-0 bg-current" />
        {title}
      </p>
      <p className="mt-1 max-w-3xl text-body-sm text-muted-foreground">{children}</p>
      {numbers.length > 0 ? (
        <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1" aria-label={listLabel}>
          {numbers.map((number) => (
            <li key={number}>
              <Link
                href={orderHref(number)}
                className="inline-flex min-h-8 items-center text-body-sm text-foreground tabular-nums"
              >
                <span className="link-underline-static pb-0.5">{number}</span>
              </Link>
            </li>
          ))}
          {more > 0 ? (
            <li>
              <Link href={moreHref} className="inline-flex min-h-8 items-center text-body-sm text-muted-foreground">
                <span className="link-underline-static pb-0.5">and {formatNumber(more)} more</span>
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
