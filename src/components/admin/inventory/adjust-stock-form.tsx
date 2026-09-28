"use client";

import { useState, type ReactNode } from "react";

import { adjustStock } from "@/app/admin/inventory/actions";
import {
  AdminForm,
  CheckboxField,
  FormStatus,
  NumberField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/admin/ui";
import { formatNumber } from "@/lib/admin/format";
import {
  ADJUST_REASON_OPTIONS,
  MAX_STOCK_NOTE,
  isLargeStockChange,
  parseWholeNumber,
  pieces,
  previewStockChange,
  reasonDirection,
  stockChangeFailureMessage,
  type ManualAdjustReason,
  type StockActionTarget,
  type StockDirection,
} from "@/lib/admin/stock-state";
import { stockDisplay } from "@/lib/admin/status";

import {
  ChoiceFieldset,
  CurrentLevels,
  PendingReporter,
  PreviewLine,
  StockFormActions,
} from "./stock-form-parts";

const DIRECTION_OPTIONS = [
  { value: "add", label: "Add pieces" },
  { value: "remove", label: "Remove pieces" },
] as const satisfies readonly { value: StockDirection; label: string }[];

export interface StockFormProps {
  target: StockActionTarget;
  /** After a successful save, with the result's message. */
  onDone: (message?: string) => void;
  onCancel: () => void;
  onPendingChange?: (pending: boolean) => void;
}

/**
 * Add or remove pieces with a reason. Shows what the change would do as it's
 * typed, refuses (like the server) to go below what's held for unpaid orders,
 * and asks for a tick before a large change.
 */
export function AdjustStockForm({ target, onDone, onCancel, onPendingChange }: StockFormProps) {
  const [reason, setReason] = useState<ManualAdjustReason>("RESTOCK");
  const [direction, setDirection] = useState<StockDirection>("add");
  const [quantityText, setQuantityText] = useState("");

  const implied = reasonDirection(reason);
  const effective: StockDirection = implied === "either" ? direction : implied;
  const quantity = parseWholeNumber(quantityText);
  const delta = quantity !== null && quantity > 0 ? (effective === "add" ? quantity : -quantity) : null;
  const preview = delta !== null ? previewStockChange(target, delta) : null;
  const large = delta !== null && isLargeStockChange(delta, target.onHand);

  let previewText: ReactNode = null;
  if (preview) {
    previewText = preview.ok ? (
      <PreviewLine>
        After this: {formatNumber(preview.onHand)} on hand, {formatNumber(preview.available)} available to
        sell ({stockDisplay({ ...target, onHand: preview.onHand }).label.toLowerCase()}).
      </PreviewLine>
    ) : (
      <PreviewLine tone="warning">{stockChangeFailureMessage(preview.reason, target)}</PreviewLine>
    );
  }

  return (
    <AdminForm action={adjustStock} onSuccess={(result) => onDone(result.message)} className="space-y-5">
      {({ pending }) => (
        <>
          <PendingReporter pending={pending} onChange={onPendingChange} />
          <input type="hidden" name="variantId" value={target.variantId} />
          <input type="hidden" name="seenOnHand" value={target.onHand} />

          <CurrentLevels level={target} />

          <ChoiceFieldset
            name="reason"
            legend="Why is the stock changing?"
            options={ADJUST_REASON_OPTIONS}
            value={reason}
            onChange={setReason}
          />

          {implied === "either" ? (
            <ChoiceFieldset
              name="direction"
              legend="Add or remove?"
              options={DIRECTION_OPTIONS}
              value={direction}
              onChange={setDirection}
            />
          ) : null}

          <NumberField
            name="quantity"
            label={effective === "add" ? "Pieces to add" : "Pieces to remove"}
            suffix="pieces"
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            maxLength={9}
            required
            className="max-w-xs"
            hint={previewText ?? "A whole number, e.g. 6."}
          />

          {reason === "ORDER_RETURNED" ? (
            <TextField
              name="orderNumber"
              label="Order number"
              optional
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              placeholder="ORD-2026-001284"
              className="max-w-xs"
              hint="Links the return to its order in the history. If you refunded the order with its items put back in stock, they’re already counted — don’t add them again."
            />
          ) : null}

          <TextAreaField
            name="note"
            label="Note"
            optional
            rows={2}
            maxLength={MAX_STOCK_NOTE}
            hint="Shown in the stock history, e.g. a delivery note or what happened."
          />

          {large && delta !== null ? (
            <CheckboxField
              key={delta}
              name="confirmLarge"
              label={delta > 0 ? `Yes, add ${pieces(delta)}` : `Yes, remove ${pieces(-delta)}`}
              hint="This is a large change, so please check the number before saving."
            />
          ) : null}

          <StockFormActions pending={pending} onCancel={onCancel}>
            <SubmitButton pendingLabel="Saving…">Save change</SubmitButton>
          </StockFormActions>
          <FormStatus />
        </>
      )}
    </AdminForm>
  );
}
