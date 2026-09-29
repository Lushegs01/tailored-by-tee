import {
  AdminEmptyState,
  DataTable,
  RowHeader,
  StatusBadge,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { formatAdminDateTime, formatKobo } from "@/lib/admin/format";
import type { AdminOrderDetail } from "@/lib/admin/orders";
import { paymentStatusDisplay, refundStatusDisplay } from "@/lib/admin/status";

import { actorName, paymentChannelLabel } from "./order-copy";
import { OrderRefundCheck } from "./order-refund-check";

/*
 * Every attempt to pay, and every refund.
 *
 * Both are read-only records of what Paystack did. An admin can ask Paystack to
 * check an attempt or to return a payment; nothing in the admin area can declare
 * a payment successful, which is why there is no control to do so here.
 */

type Payment = AdminOrderDetail["payments"][number];
type Refund = AdminOrderDetail["refunds"][number];

export function OrderPayments({ payments }: { payments: readonly Payment[] }) {
  if (payments.length === 0) {
    return (
      <AdminEmptyState
        title="No payment started"
        body="The customer reached checkout but hasn’t been sent to Paystack yet, or the attempt was never recorded."
      />
    );
  }

  return (
    <DataTable caption="Payment attempts" frameClassName="border-0">
      <THead>
        <Tr>
          <Th>Reference</Th>
          <Th align="end">Amount</Th>
          <Th>Status</Th>
          <Th>How</Th>
          <Th>Started</Th>
          <Th>Confirmed</Th>
        </Tr>
      </THead>
      <TBody>
        {payments.map((payment) => {
          const status = paymentStatusDisplay(payment.status, payment.isTest);
          const channel = paymentChannelLabel(payment.channel);
          // Paystack's own moment of payment when it gave one, else when we verified it.
          const confirmedAt = payment.paidAt ?? payment.verifiedAt;

          return (
            <Tr key={payment.id}>
              <RowHeader>
                <span className="block font-mono text-caption break-all">{payment.reference}</span>
                {payment.providerTransactionId ? (
                  <span className="mt-0.5 block text-caption break-all text-muted-foreground">
                    Paystack {payment.providerTransactionId}
                  </span>
                ) : null}
              </RowHeader>

              <Td label="Amount" align="end">
                <span className="tabular-nums">{formatKobo(payment.amount)}</span>
              </Td>

              <Td label="Status">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {payment.gatewayResponse ? (
                  <span className="mt-1 block text-caption break-words text-muted-foreground">
                    {payment.gatewayResponse}
                  </span>
                ) : null}
              </Td>

              <Td label="How">{channel ?? <span className="text-muted-foreground">—</span>}</Td>

              <Td label="Started">
                <time dateTime={payment.createdAt.toISOString()} className="tabular-nums">
                  {formatAdminDateTime(payment.createdAt)}
                </time>
              </Td>

              <Td label="Confirmed">
                {confirmedAt ? (
                  <time dateTime={confirmedAt.toISOString()} className="tabular-nums">
                    {formatAdminDateTime(confirmedAt)}
                  </time>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}

export function OrderRefunds({ number, refunds }: { number: string; refunds: readonly Refund[] }) {
  return (
    <DataTable caption="Refunds" frameClassName="border-0">
      <THead>
        <Tr>
          <Th align="end">Amount</Th>
          <Th>Status</Th>
          <Th>Asked by</Th>
          <Th>Asked</Th>
          <Th>Details</Th>
        </Tr>
      </THead>
      <TBody>
        {refunds.map((refund) => {
          const status = refundStatusDisplay(refund.status);

          return (
            <Tr key={refund.id}>
              <RowHeader align="end">
                <span className="tabular-nums">{formatKobo(refund.amount)}</span>
              </RowHeader>

              <Td label="Status">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {refund.restocked ? (
                  <span className="mt-1 block text-caption text-muted-foreground">Pieces back on sale</span>
                ) : null}
              </Td>

              <Td label="Asked by">{actorName(refund.actor)}</Td>

              <Td label="Asked">
                <time dateTime={refund.createdAt.toISOString()} className="tabular-nums">
                  {formatAdminDateTime(refund.createdAt)}
                </time>
              </Td>

              <Td label="Details">
                {refund.providerReference ? (
                  <span className="block font-mono text-caption break-all text-muted-foreground">
                    Paystack {refund.providerReference}
                  </span>
                ) : null}
                {refund.reason ? (
                  <span className="mt-1 block text-caption break-words text-muted-foreground">{refund.reason}</span>
                ) : null}
                {refund.status === "PENDING" ? (
                  <div className="mt-2">
                    <OrderRefundCheck number={number} refundId={refund.id} />
                  </div>
                ) : null}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
