"use client";

import { DropdownMenu } from "radix-ui";
import { useCallback, useRef, useState, useTransition, type ReactNode } from "react";

import {
  deleteProductVariant,
  saveProductVariantPrice,
  setProductVariantActive,
} from "@/app/admin/products/[id]/variant-actions";
import { AdjustStockForm, type StockFormProps } from "@/components/admin/inventory/adjust-stock-form";
import { CountStockForm } from "@/components/admin/inventory/count-stock-form";
import { StockHistorySheet } from "@/components/admin/inventory/stock-history-sheet";
import { ThresholdForm } from "@/components/admin/inventory/threshold-form";
import { ConfirmDialog, MoneyField } from "@/components/admin/ui";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { AdminActionResult } from "@/lib/admin/auth";
import { formatKobo } from "@/lib/admin/format";
import type { StockActionTarget } from "@/lib/admin/stock-state";

import { DialogNote, FormDialog } from "./form-dialog";
import { variantDeleteBlock, variantDeleteBlockedMessage, variantOptionLabel, type VariantView } from "./variant-rules";

/*
 * Everything that can be done to one variant, from its row in the matrix.
 *
 * Stock — adjust, record a count, change the low-stock level, history — uses the
 * inventory page's own forms and actions, so a change made here behaves exactly
 * as it does there. The rest (switching the variant off, its own price, deleting
 * it) goes through the product's variant actions.
 */

type Panel = "adjust" | "count" | "threshold" | "history" | "price" | "switch" | "delete" | "blocked";

export interface VariantRowActionsProps {
  productId: string;
  productName: string;
  /** The product's own price in kobo, shown as what a blank variant price means. */
  productPrice: number;
  variant: VariantView;
  announce: (message: string) => void;
}

export function VariantRowActions({ productId, productName, productPrice, variant, announce }: VariantRowActionsProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingSwitch, startSwitch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const queued = useRef<Panel | null>(null);

  const label = variantOptionLabel(variant.colorName, variant.sizeLabel);
  const description = `${label} · ${variant.sku}`;
  const blocked = variantDeleteBlock(variant);

  const target: StockActionTarget = {
    variantId: variant.id,
    sku: variant.sku,
    productName,
    colorName: variant.colorName,
    sizeLabel: variant.sizeLabel,
    isActive: variant.isActive,
    onHand: variant.onHand,
    reserved: variant.reserved,
    lowStockThreshold: variant.lowStockThreshold,
    awaitingShipment: variant.awaitingShipment,
  };

  const onPendingChange = useCallback((pending: boolean) => setBusy(pending), []);

  function close() {
    if (busy) return;
    setPanel(null);
  }

  function done(message?: string) {
    setBusy(false);
    setPanel(null);
    if (message) announce(message);
  }

  function onDialogOpenChange(open: boolean) {
    if (!open) close();
  }

  function switchOn() {
    setError(null);
    startSwitch(async () => {
      let result: AdminActionResult<{ isActive: boolean }>;
      try {
        result = await setProductVariantActive({ productId, variantId: variant.id, isActive: true });
      } catch {
        result = { ok: false, message: "That didn’t save. Refresh the page and try again." };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      announce(result.message ?? `Switched on ${label}.`);
    });
  }

  const formProps: StockFormProps = { target, onDone: done, onCancel: close, onPendingChange };

  return (
    <div className="relative z-10 flex flex-wrap items-center justify-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 px-3"
        aria-haspopup="dialog"
        onClick={() => setPanel("adjust")}
      >
        Adjust<span className="sr-only"> stock of {label}</span>
      </Button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 px-3" disabled={pendingSwitch}>
            More<span className="sr-only"> actions for {label}</span>
            <ChevronDownIcon aria-hidden="true" className="text-base" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            collisionPadding={16}
            className="z-50 min-w-60 border bg-background-raised py-1 text-body-sm text-foreground"
            onCloseAutoFocus={() => {
              const next = queued.current;
              queued.current = null;
              if (next) setPanel(next);
            }}
          >
            <MenuItem
              onSelect={() => {
                queued.current = "count";
              }}
            >
              Record a count
            </MenuItem>
            <MenuItem
              onSelect={() => {
                queued.current = "threshold";
              }}
            >
              Change low-stock level
            </MenuItem>
            <MenuItem
              onSelect={() => {
                queued.current = "history";
              }}
            >
              View history
            </MenuItem>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <MenuItem
              onSelect={() => {
                queued.current = "price";
              }}
            >
              {variant.priceOverride === null ? "Set its own price" : "Change its own price"}
            </MenuItem>
            {variant.isActive ? (
              <MenuItem
                onSelect={() => {
                  queued.current = "switch";
                }}
              >
                Switch off
              </MenuItem>
            ) : (
              <MenuItem onSelect={switchOn}>Switch on</MenuItem>
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <MenuItem
              onSelect={() => {
                queued.current = blocked ? "blocked" : "delete";
              }}
            >
              Delete variant
            </MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {error ? (
        <p role="alert" className="w-full text-right text-caption text-danger">
          {error}
        </p>
      ) : null}

      <Dialog open={panel === "adjust"} onOpenChange={onDialogOpenChange} title="Adjust stock" description={description}>
        <AdjustStockForm {...formProps} />
      </Dialog>
      <Dialog open={panel === "count"} onOpenChange={onDialogOpenChange} title="Record a count" description={description}>
        <CountStockForm {...formProps} />
      </Dialog>
      <Dialog
        open={panel === "threshold"}
        onOpenChange={onDialogOpenChange}
        title="Low-stock level"
        description={description}
      >
        <ThresholdForm {...formProps} />
      </Dialog>
      <StockHistorySheet open={panel === "history"} onOpenChange={onDialogOpenChange} target={target} />

      <FormDialog
        open={panel === "price"}
        onOpenChange={(open) => setPanel(open ? "price" : null)}
        title="This variant’s own price"
        description={description}
        action={saveProductVariantPrice}
        submitLabel="Save price"
        onSaved={(message) => done(message)}
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="variantId" value={variant.id} />
        <MoneyField
          name="priceOverride"
          label="Price for this size and colour"
          optional
          defaultKobo={variant.priceOverride}
          hint={`Leave it blank to use the product price, ${formatKobo(productPrice)}.`}
          className="max-w-56"
        />
        <DialogNote>
          Rare: use it only when one size or colour genuinely costs a different amount. The price customers pay, in the
          bag and at checkout, follows this straight away. Orders already placed keep the price they were charged.
        </DialogNote>
      </FormDialog>

      <ConfirmDialog
        open={panel === "switch"}
        onOpenChange={(open) => setPanel(open ? "switch" : null)}
        title={`Switch off ${label}?`}
        description="Customers will no longer be able to buy this size in this colour."
        confirmLabel="Switch it off"
        pendingLabel="Switching off…"
        action={() => setProductVariantActive({ productId, variantId: variant.id, isActive: false })}
        onSuccess={(result) => announce(result.message ?? `Switched off ${label}.`)}
      >
        <p>
          Its stock stays as it is and past orders are unaffected. You can switch it back on at any time from this
          menu.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={panel === "delete"}
        onOpenChange={(open) => setPanel(open ? "delete" : null)}
        title={`Delete ${label}?`}
        description={`${variant.sku} will be removed from this product.`}
        confirmLabel="Delete variant"
        pendingLabel="Deleting…"
        tone="destructive"
        action={() => deleteProductVariant({ productId, variantId: variant.id })}
        onSuccess={(result) => announce(result.message ?? `Deleted ${label}.`)}
      >
        <p>It has never been ordered and has no stock, so nothing is lost. You can create it again at any time.</p>
      </ConfirmDialog>

      <Dialog
        open={panel === "blocked"}
        onOpenChange={(open) => setPanel(open ? "blocked" : null)}
        title={`${label} can’t be deleted`}
        description={variant.sku}
      >
        <p className="text-body-sm">{variantDeleteBlockedMessage(variant)}</p>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setPanel(null)}>
            Close
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function MenuItem({ onSelect, children }: { onSelect: () => void; children: ReactNode }) {
  return (
    <DropdownMenu.Item
      onSelect={() => {
        onSelect();
      }}
      className="flex min-h-10 cursor-pointer items-center px-3 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-surface"
    >
      {children}
    </DropdownMenu.Item>
  );
}
