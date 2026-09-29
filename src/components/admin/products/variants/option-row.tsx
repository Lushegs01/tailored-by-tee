"use client";

import { DropdownMenu } from "radix-ui";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/admin/ui";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { AdminActionResult } from "@/lib/admin/auth";

import {
  canRemoveOption,
  optionRemovalAdvice,
  optionRemovalProblem,
  variantCount,
  type OptionUsage,
} from "./variant-rules";

/*
 * One colour or size on the product: its name, its code, what it is used by, and
 * the controls for moving it, switching its variants off and taking it off the
 * product.
 *
 * A colour or size can only come off when none of its variants has been ordered
 * (orders keep a record of what was bought) and none has stock. When it can't,
 * the dialog says why and offers the thing the owner actually wants — switching
 * its variants off, so customers stop seeing it.
 */

type MoveDirection = "up" | "down";

const CONTROL =
  "inline-flex size-9 items-center justify-center border border-border-strong text-base text-foreground transition-colors hover:bg-surface focus-visible:outline-[1.5px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-30 aria-disabled:cursor-progress aria-disabled:opacity-60";

export interface OptionRowProps {
  kind: "colour" | "size";
  /** "Sand", "size M" — used in labels and within sentences. */
  name: string;
  /** The same thing at the start of a sentence: "Sand", "Size M". Defaults to `name`. */
  sentenceName?: string;
  /** How the row starts: a swatch, or nothing. */
  leading?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  /** 0-based position among the product's colours or sizes. */
  index: number;
  count: number;
  usage: OptionUsage;
  move: (direction: MoveDirection) => Promise<AdminActionResult>;
  remove: () => Promise<AdminActionResult>;
  setVariantsActive: (isActive: boolean) => Promise<AdminActionResult<{ changed: number }>>;
  /** Announces a saved change on the section's confirmation line. */
  announce: (message: string) => void;
}

type Panel = "remove" | "switch-off" | "switch-on" | "blocked";

export function OptionRow({
  kind,
  name,
  sentenceName,
  leading,
  title,
  meta,
  index,
  count,
  usage,
  move,
  remove,
  setVariantsActive,
  announce,
}: OptionRowProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const queued = useRef<Panel | null>(null);
  const removable = canRemoveOption(usage);
  const problem = optionRemovalProblem(sentenceName ?? name, usage);
  const advice = optionRemovalAdvice(kind, name, usage);

  function openRemove(): Panel {
    if (removable) return "remove";
    return usage.active > 0 ? "switch-off" : "blocked";
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {leading ? <span className="mt-0.5 shrink-0">{leading}</span> : null}
        <div className="min-w-0">
          <p className="text-body-sm font-medium">{title}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">{meta}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <ReorderButtons itemName={name} index={index} count={count} move={move} announce={announce} />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 px-3">
              More<span className="sr-only"> actions for {name}</span>
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
              {usage.variants > 0 ? (
                <MenuItem
                  onSelect={() => {
                    queued.current = usage.active > 0 ? "switch-off" : "switch-on";
                  }}
                >
                  {usage.active > 0 ? `Switch ${name} off` : `Switch ${name} back on`}
                </MenuItem>
              ) : null}
              <MenuItem
                onSelect={() => {
                  queued.current = openRemove();
                }}
              >
                Remove {name}
              </MenuItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Can be removed: a plain destructive confirmation. */}
      <ConfirmDialog
        open={panel === "remove"}
        onOpenChange={(open) => setPanel(open ? "remove" : null)}
        title={`Remove ${name} from this product?`}
        description={`Customers will no longer see ${kind === "colour" ? "this colour" : "this size"}.`}
        confirmLabel={`Remove ${name}`}
        pendingLabel="Removing…"
        tone="destructive"
        action={remove}
        onSuccess={(result) => announce(result.message ?? `Removed ${name}.`)}
      >
        <p>
          {usage.variants > 0
            ? `Its ${variantCount(usage.variants)} will be deleted with it. None has been ordered and none has stock, so nothing is lost.`
            : "It has no variants, so nothing else changes."}
        </p>
        <p>You can add it again at any time.</p>
      </ConfirmDialog>

      {/* Switching every variant of this colour or size off — on its own, or instead of removing it. */}
      <ConfirmDialog
        open={panel === "switch-off"}
        onOpenChange={(open) => setPanel(open ? "switch-off" : null)}
        title={`Stop selling ${name}?`}
        description={`Its ${variantCount(usage.active)} will be switched off.`}
        confirmLabel="Switch them off"
        pendingLabel="Switching off…"
        action={() => setVariantsActive(false)}
        onSuccess={(result) => announce(result.message ?? `Switched off ${name}.`)}
      >
        {removable ? (
          <p>Customers will no longer be able to buy {name}. Stock and past orders are unaffected.</p>
        ) : (
          <>
            {problem ? <p>{problem}</p> : null}
            <p>{advice}</p>
          </>
        )}
      </ConfirmDialog>

      {/* Putting it back on sale. */}
      <ConfirmDialog
        open={panel === "switch-on"}
        onOpenChange={(open) => setPanel(open ? "switch-on" : null)}
        title={`Sell ${name} again?`}
        description={`Its ${variantCount(usage.variants)} will be switched back on.`}
        confirmLabel="Switch them on"
        pendingLabel="Switching on…"
        action={() => setVariantsActive(true)}
        onSuccess={(result) => announce(result.message ?? `Switched on ${name}.`)}
      >
        <p>Those with stock go back on sale straight away; the rest show as sold out until you add stock.</p>
      </ConfirmDialog>

      {/* Can't be removed and already switched off: nothing to do but explain. */}
      <Dialog
        open={panel === "blocked"}
        onOpenChange={(open) => setPanel(open ? "blocked" : null)}
        title={`${sentenceName ?? name} can’t be removed`}
        description="It stays on the product, but customers can’t buy it."
      >
        <div className="space-y-3 text-body-sm [&_p+p]:mt-3">
          {problem ? <p>{problem}</p> : null}
          <p>{advice}</p>
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setPanel(null)}>
            Close
          </Button>
        </div>
      </Dialog>
    </li>
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

/**
 * "Move up" / "Move down" for one colour or size. The server works out the new
 * order from the database; this only asks. While a move is saving the buttons
 * stay focusable but inert, so keyboard focus isn't lost; afterwards focus
 * returns to the same button (or the other one when the row reached an end).
 */
function ReorderButtons({
  itemName,
  index,
  count,
  move,
  announce,
}: {
  itemName: string;
  index: number;
  count: number;
  move: (direction: MoveDirection) => Promise<AdminActionResult>;
  announce: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<MoveDirection | null>(null);

  const canUp = index > 0;
  const canDown = index < count - 1;

  useEffect(() => {
    const wanted = restoreFocus.current;
    if (!wanted) return;
    restoreFocus.current = null;
    const same = wanted === "up" ? canUp : canDown;
    const target = wanted === "up" ? (same ? upRef : downRef) : same ? downRef : upRef;
    target.current?.focus();
  }, [index, count, canUp, canDown]);

  function run(direction: MoveDirection) {
    if (pending) return;
    const hadFocus = document.activeElement === upRef.current || document.activeElement === downRef.current;
    setError(null);
    startTransition(async () => {
      let result: AdminActionResult;
      try {
        result = await move(direction);
      } catch {
        result = { ok: false, message: "That didn’t save. Refresh the page and try again." };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (hadFocus) restoreFocus.current = direction;
      announce(result.message ?? `Moved ${itemName} ${direction}.`);
    });
  }

  if (count < 2) return null;

  return (
    <div className="flex items-center gap-1.5" aria-busy={pending || undefined}>
      <button
        ref={upRef}
        type="button"
        className={CONTROL}
        disabled={!canUp}
        aria-disabled={pending || undefined}
        aria-label={`Move ${itemName} up`}
        title="Move up"
        onClick={() => run("up")}
      >
        <ChevronDownIcon aria-hidden="true" className="rotate-180" />
      </button>
      <button
        ref={downRef}
        type="button"
        className={CONTROL}
        disabled={!canDown}
        aria-disabled={pending || undefined}
        aria-label={`Move ${itemName} down`}
        title="Move down"
        onClick={() => run("down")}
      >
        <ChevronDownIcon aria-hidden="true" />
      </button>
      {error ? (
        <p role="alert" className="max-w-56 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
