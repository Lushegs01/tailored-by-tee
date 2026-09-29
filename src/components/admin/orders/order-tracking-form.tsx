"use client";

import { saveOrderTracking } from "@/app/admin/orders/actions";
import { AdminForm, FormStatus, SubmitButton, TextField } from "@/components/admin/ui";
import type { OrderStatus } from "@/generated/prisma/enums";

import { TRACKING_NOTE } from "./order-copy";
import { useOrderFeedback } from "./order-feedback";

/*
 * Correcting the courier details after an order has already gone out — a
 * reference typed wrongly, or one the courier only gave later. It doesn't email
 * the customer again; their order page simply shows the new details.
 *
 * Like every step here it carries the order as this page saw it, so a correction
 * made against an order that has since moved on is refused rather than applied.
 */

export interface OrderTrackingFormProps {
  number: string;
  status: OrderStatus;
  updatedAt: Date;
  carrier: string | null;
  trackingNumber: string | null;
}

export function OrderTrackingForm({ number, status, updatedAt, carrier, trackingNumber }: OrderTrackingFormProps) {
  const announce = useOrderFeedback();

  return (
    <AdminForm
      action={saveOrderTracking}
      className="space-y-5"
      onSuccess={(result) => announce(result.message ?? "Tracking details saved.")}
    >
      <input type="hidden" name="number" value={number} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="updatedAt" value={updatedAt.toISOString()} />

      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          name="carrier"
          label="Courier"
          optional
          defaultValue={carrier ?? ""}
          autoComplete="off"
          placeholder="GIG Logistics"
        />
        <TextField
          name="trackingNumber"
          label="Tracking number"
          optional
          defaultValue={trackingNumber ?? ""}
          autoComplete="off"
        />
      </div>

      <p className="text-caption text-muted-foreground">{TRACKING_NOTE}</p>

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
        <FormStatus className="sm:mr-auto" />
        <SubmitButton variant="outline">Save tracking</SubmitButton>
      </div>
    </AdminForm>
  );
}
