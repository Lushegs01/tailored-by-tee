"use client";

import { useState } from "react";

import { advanceOrder, cancelOrder, recheckOrderPayment, refundOrder, shipOrder } from "@/app/admin/orders/actions";
import { FormDialog } from "@/components/admin/products/variants/form-dialog";
import {
  CheckboxField,
  ConfirmDialog,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import type { DeliveryMethod, OrderStatus } from "@/generated/prisma/enums";
import { formatKobo } from "@/lib/admin/format";
import { actionCopy, deliveredWord, type OrderAction } from "@/lib/admin/order-transitions";
import type { RefundablePayment } from "@/lib/admin/orders";

import { useOrderFeedback } from "./order-feedback";

/*
 * Everything the owner can do to this order, as plain buttons — no menus to
 * discover, because on a phone in a studio the step needs to be one tap away.
 *
 * Which steps appear is decided on the server by the transition rules, and the
 * server checks them again before it writes. Each button carries the status and
 * the exact moment the page was rendered, so a step taken against an order that
 * has since moved on (a webhook, another admin) is refused rather than applied to
 * something the owner never saw.
 *
 * Consequential steps confirm first; the two that need details — going out, and
 * refunding — open a small form. What happened is announced on the page's one
 * confirmation line, because the dialog that started it has closed by then.
 */

export interface OrderActionsProps {
  number: string;
  status: OrderStatus;
  /** The moment the page was rendered from, echoed back so a stale step is refused. */
  updatedAt: Date;
  deliveryMethod: DeliveryMethod;
  /** The steps the rules allow right now, worked out on the server. */
  actions: readonly OrderAction[];
  carrier: string | null;
  trackingNumber: string | null;
  /** Successful payments with money still to return, newest first. */
  refundable: readonly RefundablePayment[];
  /** Pieces that could go back on sale with a refund. */
  restockablePieces: number;
}

/** Which step leads, when several are offered. Only this one gets the filled button. */
const PRIORITY: readonly OrderAction[] = [
  "recheck_payment",
  "start_processing",
  "mark_shipped",
  "mark_delivered",
  "refund",
  "cancel_paid",
  "cancel_unpaid",
];

export function OrderActions({
  number,
  status,
  updatedAt,
  deliveryMethod,
  actions,
  carrier,
  trackingNumber,
  refundable,
  restockablePieces,
}: OrderActionsProps) {
  const announce = useOrderFeedback();
  const [shipOpen, setShipOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const expected = { number, status, updatedAt };
  const lead = PRIORITY.find((action) => actions.includes(action));
  const variant = (action: OrderAction) => (action === lead ? "primary" : "outline");
  const pickup = deliveryMethod === "PICKUP";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {actions.map((action) => {
          const copy = actionCopy(action, deliveryMethod);

          if (action === "mark_shipped") {
            return (
              <Button key={action} variant={variant(action)} size="sm" onClick={() => setShipOpen(true)}>
                {copy.label}
              </Button>
            );
          }

          if (action === "refund") {
            return (
              <Button key={action} variant={variant(action)} size="sm" onClick={() => setRefundOpen(true)}>
                {copy.label}
              </Button>
            );
          }

          if (action === "cancel_unpaid" || action === "cancel_paid") {
            const paid = action === "cancel_paid";
            return (
              <ConfirmDialog
                key={action}
                trigger={
                  <Button variant={variant(action)} size="sm">
                    {copy.label}
                  </Button>
                }
                title={`${copy.title.replace(/\?$/, "")} — ${number}?`}
                description={copy.description}
                confirmLabel={copy.confirmLabel}
                pendingLabel={copy.pendingLabel}
                tone="destructive"
                action={() => cancelOrder(expected)}
                onSuccess={(result) => announce(result.message ?? "Order cancelled.", paid ? "note" : "done")}
              >
                {paid ? (
                  <div className="space-y-2 text-body-sm">
                    <p>
                      Cancelling doesn’t move any money. The order will be marked <strong>Refund due</strong> until
                      you refund it, and the pieces stay counted as sold.
                    </p>
                    <p className="text-muted-foreground">
                      To return the money as well, cancel here and then use “Refund payment”, which can also put the
                      pieces back on sale.
                    </p>
                  </div>
                ) : (
                  <p className="text-body-sm">
                    The customer hasn’t paid. The pieces they were holding go back on sale straight away, and any
                    discount code they used becomes available again. The customer isn’t emailed.
                  </p>
                )}
              </ConfirmDialog>
            );
          }

          if (action === "recheck_payment") {
            return (
              <ConfirmDialog
                key={action}
                trigger={
                  <Button variant={variant(action)} size="sm">
                    {copy.label}
                  </Button>
                }
                title={copy.title}
                description={copy.description}
                confirmLabel={copy.confirmLabel}
                pendingLabel={copy.pendingLabel}
                action={() => recheckOrderPayment(expected)}
                onSuccess={(result) => announce(result.message ?? "Paystack has been asked.", "note")}
              >
                <p className="text-body-sm text-muted-foreground">
                  Paystack decides. If it confirms the payment the order becomes paid; if it says the payment failed
                  or never finished, nothing changes and the customer can still pay.
                </p>
              </ConfirmDialog>
            );
          }

          return (
            <ConfirmDialog
              key={action}
              trigger={
                <Button variant={variant(action)} size="sm">
                  {copy.label}
                </Button>
              }
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.confirmLabel}
              pendingLabel={copy.pendingLabel}
              action={() => advanceOrder({ ...expected, action })}
              onSuccess={(result) => announce(result.message ?? "Order updated.")}
            >
              {action === "mark_delivered" ? (
                <p className="text-body-sm text-muted-foreground">
                  The customer is emailed to confirm the order was {deliveredWord(deliveryMethod)}.
                </p>
              ) : null}
            </ConfirmDialog>
          );
        })}
      </div>

      <ShipDialog
        open={shipOpen}
        onOpenChange={setShipOpen}
        number={number}
        status={status}
        updatedAt={updatedAt}
        pickup={pickup}
        carrier={carrier}
        trackingNumber={trackingNumber}
        onSaved={(message) => announce(message ?? "Order updated.")}
      />

      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        number={number}
        status={status}
        updatedAt={updatedAt}
        refundable={refundable}
        restockablePieces={restockablePieces}
        onSaved={(message) => announce(message ?? "The refund is with Paystack.", "note")}
      />
    </>
  );
}

/** The hidden fields every step sends: the order as this page saw it. */
function ExpectedFields({ number, status, updatedAt }: { number: string; status: OrderStatus; updatedAt: Date }) {
  return (
    <>
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="updatedAt" value={updatedAt.toISOString()} />
    </>
  );
}

/* ── Going out ──────────────────────────────────────────────────────────── */

function ShipDialog({
  open,
  onOpenChange,
  number,
  status,
  updatedAt,
  pickup,
  carrier,
  trackingNumber,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: string;
  status: OrderStatus;
  updatedAt: Date;
  pickup: boolean;
  carrier: string | null;
  trackingNumber: string | null;
  onSaved: (message?: string) => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={pickup ? `Mark ${number} as ready for collection?` : `Mark ${number} as shipped?`}
      description={
        pickup
          ? "The customer is emailed to say their order is packed and ready to collect from the studio."
          : "The customer is emailed that their order has left the studio, with the courier details if you add them."
      }
      action={shipOrder}
      submitLabel={pickup ? "Ready for collection" : "Mark as shipped"}
      pendingLabel="Saving…"
      onSaved={onSaved}
    >
      <ExpectedFields number={number} status={status} updatedAt={updatedAt} />
      {pickup ? (
        <p className="text-body-sm text-muted-foreground">
          There is nothing to track for a collection. The email tells the customer the studio’s opening hours and
          asks them to bring their order number.
        </p>
      ) : (
        <>
          <TextField
            name="carrier"
            label="Courier"
            optional
            defaultValue={carrier ?? ""}
            autoComplete="off"
            placeholder="GIG Logistics"
            hint="Who is carrying it."
          />
          <TextField
            name="trackingNumber"
            label="Tracking number"
            optional
            defaultValue={trackingNumber ?? ""}
            autoComplete="off"
            hint="Left blank, the email simply says the order is on its way."
          />
        </>
      )}
    </FormDialog>
  );
}

/* ── Refunds ────────────────────────────────────────────────────────────── */

function RefundDialog({
  open,
  onOpenChange,
  number,
  status,
  updatedAt,
  refundable,
  restockablePieces,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: string;
  status: OrderStatus;
  updatedAt: Date;
  refundable: readonly RefundablePayment[];
  restockablePieces: number;
  onSaved: (message?: string) => void;
}) {
  // Only a payment with money still to return can be refunded.
  const outstanding = refundable.filter((payment) => payment.remaining > 0);
  const only = outstanding.length === 1 ? outstanding[0] : null;
  const anyTest = outstanding.some((payment) => payment.isTest);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Refund the payment for ${number}?`}
      description="Paystack returns the money to the card or account it came from. This can’t be undone here."
      action={refundOrder}
      submitLabel="Refund payment"
      pendingLabel="Asking Paystack…"
      onSaved={onSaved}
    >
      <ExpectedFields number={number} status={status} updatedAt={updatedAt} />

      {only ? (
        <>
          <input type="hidden" name="paymentId" value={only.id} />
          <p className="border px-4 py-3 text-body-sm">
            Paystack will return <strong className="tabular-nums">{formatKobo(only.remaining)}</strong> against{" "}
            <span className="break-all font-mono text-caption">{only.reference}</span>.
          </p>
        </>
      ) : (
        <SelectField
          name="paymentId"
          label="Which payment"
          options={outstanding.map((payment) => ({
            value: payment.id,
            label: `${formatKobo(payment.remaining)} — ${payment.reference}${payment.isTest ? " (test)" : ""}`,
          }))}
          hint="This order has more than one payment with money still to return."
        />
      )}

      {anyTest ? (
        <p className="border border-border-strong px-4 py-3 text-body-sm">
          This was a <strong>test payment</strong>, so no real money moved and none will move back. The refund is
          recorded exactly as a real one, so you can see how it works.
        </p>
      ) : null}

      <TextAreaField
        name="reason"
        label="Reason"
        optional
        rows={3}
        maxLength={300}
        hint="Kept with the order for your own records. Paystack and the customer never see it."
      />

      {restockablePieces > 0 ? (
        <CheckboxField
          name="restock"
          label="Put the pieces back on sale"
          hint={`Adds ${restockablePieces} ${restockablePieces === 1 ? "piece" : "pieces"} back to stock. Only tick this once the pieces are physically back in the studio.`}
        />
      ) : null}
    </FormDialog>
  );
}
