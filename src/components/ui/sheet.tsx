"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";

import { CloseIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { DURATION, EASE_DRAWER, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Side = "left" | "right" | "top" | "bottom";

const offscreen: Record<Side, { x?: string; y?: string }> = {
  right: { x: "100%" },
  left: { x: "-100%" },
  top: { y: "-100%" },
  bottom: { y: "100%" },
};

const placement: Record<Side, string> = {
  right: "inset-y-0 right-0 h-dvh w-full max-w-[28rem] border-l",
  left: "inset-y-0 left-0 h-dvh w-full max-w-[26rem] border-r",
  top: "inset-x-0 top-0 max-h-dvh w-full border-b",
  bottom: "inset-x-0 bottom-0 max-h-[88dvh] w-full border-t",
};

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: Side;
  /** Always required for screen readers; shown in the header unless `bare`. */
  title: string;
  description?: string;
  /** Extra content beside the title (e.g. an item count). */
  headerAside?: React.ReactNode;
  /** Pinned below the scrolling body (e.g. subtotal + checkout). */
  footer?: React.ReactNode;
  /** Skip the built-in header and body padding for fully custom layouts. */
  bare?: boolean;
  className?: string;
  bodyClassName?: string;
  onOpenAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}

/**
 * Drawer built on Radix Dialog (focus trap, scroll lock, Esc, aria) with Motion
 * handling enter/exit. Use for cart, navigation, filters and search.
 */
export function Sheet({
  open,
  onOpenChange,
  side = "right",
  title,
  description,
  headerAside,
  footer,
  bare = false,
  className,
  bodyClassName,
  onOpenAutoFocus,
  children,
}: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              asChild
              forceMount
              onOpenAutoFocus={onOpenAutoFocus}
              {...(description ? {} : { "aria-describedby": undefined })}
            >
              <m.div
                className={cn(
                  "fixed z-50 flex flex-col bg-background-raised text-foreground outline-none",
                  placement[side],
                  className,
                )}
                initial={offscreen[side]}
                animate={{ x: 0, y: 0 }}
                exit={offscreen[side]}
                transition={{ duration: DURATION.drawer, ease: EASE_DRAWER }}
              >
                {bare ? (
                  <>
                    <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                    {description ? (
                      <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
                    ) : null}
                    {children}
                  </>
                ) : (
                  <>
                    <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-4 border-b pl-6 pr-3">
                      <div className="flex items-baseline gap-3">
                        <DialogPrimitive.Title className="text-label">{title}</DialogPrimitive.Title>
                        {headerAside}
                      </div>
                      <DialogPrimitive.Close asChild>
                        <IconButton label="Close">
                          <CloseIcon />
                        </IconButton>
                      </DialogPrimitive.Close>
                    </header>
                    {description ? (
                      <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
                    ) : null}
                    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>
                      {children}
                    </div>
                    {footer ? <div className="shrink-0 border-t">{footer}</div> : null}
                  </>
                )}
              </m.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;
