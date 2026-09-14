import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { ArrowRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Square-cornered, tracked-caps buttons. Hierarchy comes from fill vs. outline,
 * never from size or colour — there is exactly one filled button per view.
 */
export const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 select-none items-center justify-center gap-3",
    "whitespace-nowrap text-label",
    "transition-[background-color,color,border-color,opacity] duration-300 ease-editorial",
    "disabled:pointer-events-none disabled:opacity-40",
    "aria-disabled:pointer-events-none aria-disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        primary: "bg-foreground text-background hover:bg-foreground/85",
        outline:
          "border border-foreground/60 text-foreground hover:border-foreground hover:bg-foreground hover:text-background",
        /** For use over photography. */
        light: "bg-paper text-ink hover:bg-paper-raised",
        "outline-light": "border border-paper/70 text-paper hover:border-paper hover:bg-paper hover:text-ink",
        ghost: "text-foreground hover:bg-surface",
        /** Text with a retracting underline. */
        link: "link-underline-static px-0 pb-1 text-foreground",
      },
      size: {
        sm: "h-10 px-5",
        md: "h-12 px-7",
        lg: "h-14 px-9",
        icon: "size-11",
        inline: "h-auto",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
  /** Trailing editorial arrow that slides on hover. */
  arrow?: boolean;
}

export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  arrow = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp className={cn(buttonVariants({ variant, size, fullWidth }), className)} {...props}>
      <Slot.Slottable>{children}</Slot.Slottable>
      {arrow ? (
        <ArrowRightIcon className="transition-transform duration-500 ease-editorial group-hover/button:translate-x-1" />
      ) : null}
    </Comp>
  );
}
