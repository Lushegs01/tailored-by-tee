import Link from "next/link";
import type { ComponentProps } from "react";

import { ArrowRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface TextLinkProps extends ComponentProps<typeof Link> {
  /** "arrow" = label + sliding arrow; "underline" = retracting underline; "both". */
  variant?: "arrow" | "underline" | "both";
}

/** Secondary call to action. Quieter than a button, still unmistakably a link. */
export function TextLink({ variant = "arrow", className, children, ...props }: TextLinkProps) {
  const underline = variant === "underline" || variant === "both";
  const arrow = variant === "arrow" || variant === "both";

  return (
    <Link
      className={cn("group/link inline-flex items-center gap-3 text-label text-foreground", className)}
      {...props}
    >
      <span className={cn("pb-1", underline ? "link-underline-static" : "link-underline")}>{children}</span>
      {arrow ? (
        <ArrowRightIcon className="-mt-1 transition-transform duration-500 ease-editorial group-hover/link:translate-x-1" />
      ) : null}
    </Link>
  );
}
