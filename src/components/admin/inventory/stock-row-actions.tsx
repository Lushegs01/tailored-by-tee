"use client";

import { DropdownMenu } from "radix-ui";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { variantLabel, type StockActionTarget } from "@/lib/admin/stock-state";

import { AdjustStockForm, type StockFormProps } from "./adjust-stock-form";
import { CountStockForm } from "./count-stock-form";
import { useInventoryFeedback } from "./inventory-feedback";
import { StockHistorySheet } from "./stock-history-sheet";
import { ThresholdForm } from "./threshold-form";

type Panel = "adjust" | "count" | "threshold" | "history";

/**
 * A row's stock actions: "Adjust" (the everyday one) and a "More" menu with
 * Record a count, Change low-stock level and View history. Each opens its own
 * dialog (or the history sheet). A dialog can't be closed while it's saving;
 * on success it closes and the page's confirmation line says what changed, while
 * the row itself re-renders with the new figures.
 *
 * Menu items open their dialog only once the menu has closed and handed focus
 * back to its button, so closing the dialog returns focus there too.
 */
export function StockRowActions({ target }: { target: StockActionTarget }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const queued = useRef<Panel | null>(null);
  const announce = useInventoryFeedback();
  const label = variantLabel(target);
  const description = `${label} · ${target.sku}`;

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

  const formProps: StockFormProps = { target, onDone: done, onCancel: close, onPendingChange };

  return (
    <div className="relative z-10 flex flex-wrap items-center gap-1">
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
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 px-3">
            More<span className="sr-only"> stock actions for {label}</span>
            <ChevronDownIcon aria-hidden="true" className="text-base" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            collisionPadding={16}
            className="z-50 min-w-56 border bg-background-raised py-1 text-body-sm text-foreground"
            onCloseAutoFocus={() => {
              const next = queued.current;
              queued.current = null;
              if (next) setPanel(next);
            }}
          >
            <MenuItem onSelect={() => (queued.current = "count")}>Record a count</MenuItem>
            <MenuItem onSelect={() => (queued.current = "threshold")}>Change low-stock level</MenuItem>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <MenuItem onSelect={() => (queued.current = "history")}>View history</MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog
        open={panel === "adjust"}
        onOpenChange={onDialogOpenChange}
        title="Adjust stock"
        description={description}
      >
        <AdjustStockForm {...formProps} />
      </Dialog>
      <Dialog
        open={panel === "count"}
        onOpenChange={onDialogOpenChange}
        title="Record a count"
        description={description}
      >
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
