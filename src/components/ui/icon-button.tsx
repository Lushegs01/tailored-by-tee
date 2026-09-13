import * as React from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

export interface IconButtonProps extends React.ComponentProps<"button"> {
  /** Required accessible name — icons are never self-describing. */
  label: string;
  asChild?: boolean;
  size?: "sm" | "md";
}

/** Chrome-level control: 44px touch target, icon inherits the current text colour. */
export function IconButton({
  label,
  asChild = false,
  size = "md",
  className,
  children,
  ...props
}: IconButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center text-current",
        "transition-opacity duration-300 ease-editorial hover:opacity-60",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "md" ? "size-11 text-[1.375rem]" : "size-9 text-[1.125rem]",
        className,
      )}
      {...(asChild ? {} : { type: "button" as const })}
      {...props}
    >
      {children}
    </Comp>
  );
}
