"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";

import { CloseIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { DURATION, EASE_EDITORIAL } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  className?: string;
  children: React.ReactNode;
}

/** Centred modal for focused tasks (size guide, confirmations). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  className,
  children,
}: DialogProps) {
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
                transition={{ duration: DURATION.fast, ease: EASE_EDITORIAL }}
              />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-(--gutter)">
              <DialogPrimitive.Content
                asChild
                forceMount
                {...(description ? {} : { "aria-describedby": undefined })}
              >
                <m.div
                  className={cn(
                    "pointer-events-auto flex max-h-[min(88dvh,56rem)] w-full flex-col border bg-background-raised text-foreground outline-none",
                    size === "md" ? "max-w-xl" : "max-w-4xl",
                    className,
                  )}
                  initial={{ opacity: 0, y: 12, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.99 }}
                  transition={{ duration: DURATION.base, ease: EASE_EDITORIAL }}
                >
                  <header className="flex shrink-0 items-start justify-between gap-6 border-b py-4 pl-6 pr-3">
                    <div className="pt-2.5">
                      <DialogPrimitive.Title className="text-label">{title}</DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description className="mt-2 text-body-sm text-muted-foreground">
                          {description}
                        </DialogPrimitive.Description>
                      ) : null}
                    </div>
                    <DialogPrimitive.Close asChild>
                      <IconButton label="Close">
                        <CloseIcon />
                      </IconButton>
                    </DialogPrimitive.Close>
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">{children}</div>
                </m.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
