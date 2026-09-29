"use client";

import { checkOrderRefund } from "@/app/admin/orders/actions";
import { ConfirmDialog } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

import { useOrderFeedback } from "./order-feedback";

/*
 * Following up a refund Paystack hasn't finished. Paystack is asked what became
 * of it and the order follows its answer: nothing here can decide that a refund
 * went through.
 */

export function OrderRefundCheck({ number, refundId }: { number: string; refundId: string }) {
  const announce = useOrderFeedback();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm" className="relative z-10">
          Check refund status
        </Button>
      }
      title="Check this refund with Paystack?"
      description="Paystack is asked what became of the refund, and the order follows its answer."
      confirmLabel="Check refund"
      pendingLabel="Checking…"
      action={() => checkOrderRefund({ number, refundId })}
      onSuccess={(result) => announce(result.message ?? "Paystack has been asked.", "note")}
    >
      <p className="text-body-sm text-muted-foreground">
        Banks can take several working days to return money, so a refund still showing as with Paystack is normal.
      </p>
    </ConfirmDialog>
  );
}
