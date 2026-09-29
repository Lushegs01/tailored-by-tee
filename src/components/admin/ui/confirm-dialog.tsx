"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { Slot } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { AdminActionResult } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps<T> {
  /** The control that opens the dialog, e.g. <Button variant="outline" size="sm">Cancel order</Button>. */
  trigger?: ReactElement;
  /** Controlled mode (instead of, or as well as, a trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A plain question: "Cancel order ORD-2026-001284?" */
  title: string;
  /** One sentence under the title. */
  description?: string;
  /** What will happen, what can't be undone, and anything to decide first. */
  children?: ReactNode;
  /** The verb for the action: "Cancel order", "Delete discount". Never "OK". */
  confirmLabel: string;
  pendingLabel?: string;
  /** Default "Go back" for destructive dialogs (so it never reads like "Cancel order"), otherwise "Cancel". */
  cancelLabel?: string;
  /** "destructive" colours the confirm button and starts focus on the cancel button. */
  tone?: "default" | "destructive";
  /** Runs on confirm. Typically a server action bound to its input: () => cancelOrder({ orderId }). */
  action: () => Promise<AdminActionResult<T>>;
  /** Called after a successful action, once the dialog has closed. */
  onSuccess?: (result: { ok: true; data: T; message?: string }) => void;
  disabled?: boolean;
}

/**
 * Confirmation before a consequential action. Stays open while the action runs
 * (both buttons disabled, Escape ignored), shows a failure inside the dialog, and
 * closes on success, announcing the result's message to screen readers. Keyboard
 * and focus handling come from Radix Dialog; focus returns to the trigger.
 */
export function ConfirmDialog<T>({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel = "Working…",
  cancelLabel,
  tone = "default",
  action,
  onSuccess,
  disabled = false,
}: ConfirmDialogProps<T>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const destructive = tone === "destructive";

  function setOpen(next: boolean) {
    if (!next && pending) return;
    if (next) {
      setError(null);
      setAnnouncement("");
    }
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      let result: AdminActionResult<T>;
      try {
        result = await action();
      } catch {
        result = { ok: false, message: "Something went wrong. Refresh the page to check, then try again." };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUncontrolledOpen(false);
      onOpenChange?.(false);
      setAnnouncement(result.message ?? "Done.");
      onSuccess?.(result);
    });
  }

  return (
    <>
      {trigger ? (
        <Slot.Root aria-haspopup="dialog" onClick={() => !disabled && setOpen(true)}>
          {trigger}
        </Slot.Root>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <Dialog open={open} onOpenChange={setOpen} title={title} description={description}>
        {children ? <div className="text-body-sm text-foreground [&_p+p]:mt-3">{children}</div> : null}

        <div role="alert" className={cn("text-body-sm text-danger", error && (children ? "mt-4" : ""))}>
          {error}
        </div>

        <div
          className={cn(
            "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end",
            children || error ? "mt-6" : "",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            autoFocus={destructive}
            onClick={() => setOpen(false)}
          >
            {cancelLabel ?? (destructive ? "Go back" : "Cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={confirm}
            className={destructive ? "bg-danger text-paper hover:bg-danger/85" : undefined}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
