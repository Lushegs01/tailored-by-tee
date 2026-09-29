"use client";

import { useState, type ReactNode } from "react";

import { saveLowStockThreshold } from "@/app/admin/inventory/actions";
import { AdminForm, FormStatus, NumberField, SubmitButton } from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import { MAX_LOW_STOCK_THRESHOLD, parseWholeNumber } from "@/lib/admin/stock-state";
import { stockDisplay } from "@/lib/admin/status";

import type { StockFormProps } from "./adjust-stock-form";
import { PendingReporter, PreviewLine, StockFormActions } from "./stock-form-parts";

/** The level at or below which a variant counts as low stock, with a preview of what it means now. */
export function ThresholdForm({ target, onDone, onCancel, onPendingChange }: StockFormProps) {
  const [text, setText] = useState(String(target.lowStockThreshold));
  const threshold = parseWholeNumber(text);
  const available = Math.max(0, target.onHand - target.reserved);

  let preview: ReactNode = null;
  if (threshold !== null && threshold <= MAX_LOW_STOCK_THRESHOLD) {
    const state = stockDisplay({ ...target, lowStockThreshold: threshold }).label;
    preview = (
      <PreviewLine>
        {threshold === 0 ? "Low-stock warnings will be off. " : ""}
        With {formatNumber(available)} available to sell, this shows as “{state}”.
      </PreviewLine>
    );
  }

  return (
    <AdminForm
      action={saveLowStockThreshold}
      onSuccess={(result) => onDone(result.message)}
      className="space-y-5"
    >
      {({ pending }) => (
        <>
          <PendingReporter pending={pending} onChange={onPendingChange} />
          <input type="hidden" name="variantId" value={target.variantId} />

          <p className="text-body-sm text-muted-foreground">
            When the pieces available to sell drop to this number or fewer, this colour and size shows as low
            stock here, and its product page tells shoppers how many are left (“Only 2 left”). Enter 0 to turn
            the warning off.
          </p>

          <NumberField
            name="threshold"
            label="Low-stock level"
            suffix="pieces or fewer"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={6}
            required
            className="max-w-xs"
            hint={preview ?? `A whole number from 0 to ${formatNumber(MAX_LOW_STOCK_THRESHOLD)}.`}
          />

          <StockFormActions pending={pending} onCancel={onCancel}>
            <SubmitButton pendingLabel="Saving…">Save level</SubmitButton>
          </StockFormActions>
          <FormStatus />
        </>
      )}
    </AdminForm>
  );
}
