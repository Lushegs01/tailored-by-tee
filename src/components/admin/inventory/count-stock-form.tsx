"use client";

import { useState, type ReactNode } from "react";

import { recordStockCount } from "@/app/admin/inventory/actions";
import {
  AdminForm,
  CheckboxField,
  FormStatus,
  NumberField,
  SubmitButton,
  TextAreaField,
} from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import {
  MAX_STOCK_NOTE,
  countBelowReservedMessage,
  isLargeStockChange,
  parseWholeNumber,
  pieces,
  previewCount,
} from "@/lib/admin/stock-state";

import type { StockFormProps } from "./adjust-stock-form";
import { CurrentLevels, PendingReporter, PreviewLine, StockFormActions } from "./stock-form-parts";

/**
 * A stocktake: the owner counts the pieces on the shelf and on hand is set to
 * the count. It only saves if on hand hasn't moved since the form showed it —
 * a sale in the meantime makes it fail rather than be silently undone.
 */
export function CountStockForm({ target, onDone, onCancel, onPendingChange }: StockFormProps) {
  const [countText, setCountText] = useState("");
  const counted = parseWholeNumber(countText);
  const preview = counted !== null ? previewCount(target, counted) : null;
  const large = preview?.ok === true && isLargeStockChange(preview.delta, target.onHand);

  let previewText: ReactNode = "The number you can see and touch, including pieces held for unpaid orders.";
  if (preview) {
    if (!preview.ok) {
      previewText = <PreviewLine tone="warning">{countBelowReservedMessage(preview.minimum)}</PreviewLine>;
    } else if (preview.delta === 0) {
      previewText = <PreviewLine>That matches the record. Saving notes that it was checked.</PreviewLine>;
    } else {
      previewText = (
        <PreviewLine>
          {preview.delta > 0 ? `${pieces(preview.delta)} more` : `${pieces(-preview.delta)} fewer`} than the
          record. On hand will be {formatNumber(preview.onHand)}, with {formatNumber(preview.available)}{" "}
          available to sell.
        </PreviewLine>
      );
    }
  }

  return (
    <AdminForm action={recordStockCount} onSuccess={(result) => onDone(result.message)} className="space-y-5">
      {({ pending }) => (
        <>
          <PendingReporter pending={pending} onChange={onPendingChange} />
          <input type="hidden" name="variantId" value={target.variantId} />
          {/* Live: after a refused save the page re-renders, and this shows the figure to check against. */}
          <input type="hidden" name="expectedOnHand" value={target.onHand} />

          <div className="space-y-3">
            <p className="text-body-sm">
              The record says <strong className="font-medium tabular-nums">{pieces(target.onHand)}</strong> on
              hand.
            </p>
            <CurrentLevels level={target} />
            {target.awaitingShipment > 0 ? (
              <p className="border-l-2 border-accent-brand pl-3 text-body-sm">
                Leave out the {pieces(target.awaitingShipment)} set aside for paid orders that haven’t shipped
                yet — they’ve already been taken off the record.
              </p>
            ) : null}
          </div>

          <NumberField
            name="counted"
            label="Pieces counted"
            suffix="pieces"
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
            maxLength={9}
            required
            className="max-w-xs"
            hint={previewText}
          />

          <TextAreaField
            name="note"
            label="Note"
            optional
            rows={2}
            maxLength={MAX_STOCK_NOTE}
            hint="Shown in the stock history, e.g. “Monthly count” or where the difference came from."
          />

          {large && preview?.ok ? (
            <CheckboxField
              key={preview.delta}
              name="confirmLarge"
              label={`Yes, the count is ${pieces(preview.onHand)} (${preview.delta > 0 ? "+" : "−"}${formatNumber(Math.abs(preview.delta))} on the record)`}
              hint="That’s a big difference from the record, so please count again before saving."
            />
          ) : null}

          <StockFormActions pending={pending} onCancel={onCancel}>
            <SubmitButton pendingLabel="Saving…">Save count</SubmitButton>
          </StockFormActions>
          <FormStatus />
        </>
      )}
    </AdminForm>
  );
}
