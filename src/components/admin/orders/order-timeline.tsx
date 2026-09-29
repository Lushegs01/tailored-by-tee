import type { DeliveryMethod, OrderStatus } from "@/generated/prisma/enums";
import { formatAdminDateTime, formatRelative } from "@/lib/admin/format";
import { isTroubleEvent, orderEventLabel } from "@/lib/admin/order-transitions";
import type { AdminOrderDetail } from "@/lib/admin/orders";
import { ORDER_STATUS_OPTIONS } from "@/lib/admin/status";
import { cn } from "@/lib/utils";

import { actorName } from "./order-copy";

/*
 * Everything that has happened to this order, oldest first — the order being
 * placed, Paystack confirming or refusing a payment, each step the studio took,
 * refunds, emails sent (or not), and the admins' own notes.
 *
 * It is written by the shop, by Paystack's webhook, by the scheduled sweep and by
 * the admin area alike, so entries with no admin behind them are named as such
 * rather than left blank. Entries that mean something went wrong read in the
 * critical tone, and never by colour alone — the heading says what happened.
 */

type OrderEvent = AdminOrderDetail["events"][number];

/** A status in the owner's words ("Awaiting payment"), not the database's ("PENDING"). */
function statusWord(status: OrderStatus): string {
  return ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export interface OrderTimelineProps {
  events: readonly OrderEvent[];
  deliveryMethod: DeliveryMethod;
  now: Date;
}

export function OrderTimeline({ events, deliveryMethod, now }: OrderTimelineProps) {
  return (
    <ol className="space-y-0">
      {events.map((event) => {
        const trouble = isTroubleEvent(event.type);
        const note = event.note?.trim();

        return (
          <li key={event.id} className="grid gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className={cn("text-body-sm font-medium", trouble && "text-danger")}>
                {orderEventLabel(event.type, deliveryMethod)}
              </p>
              <time
                dateTime={event.createdAt.toISOString()}
                title={formatAdminDateTime(event.createdAt)}
                className="shrink-0 text-caption tabular-nums text-muted-foreground"
              >
                {formatRelative(event.createdAt, now)}
              </time>
            </div>

            {note ? <p className="text-body-sm break-words whitespace-pre-line">{note}</p> : null}

            <p className="text-caption text-muted-foreground">
              {actorName(event.actor)}
              {event.fromStatus && event.toStatus ? (
                <span>
                  {" · "}
                  {statusWord(event.fromStatus)} → {statusWord(event.toStatus)}
                </span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
