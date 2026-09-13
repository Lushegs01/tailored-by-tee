import * as React from "react";

import { cn } from "@/lib/utils";

const fieldBase = [
  "w-full bg-transparent text-body text-foreground placeholder:text-muted-foreground",
  "transition-[border-color,box-shadow] duration-300 ease-editorial",
  "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger",
];

export interface InputProps extends React.ComponentProps<"input"> {
  /** "box" for forms, "underline" for single-field moments like the newsletter. */
  variant?: "box" | "underline";
}

export function Input({ className, variant = "box", type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        fieldBase,
        variant === "box"
          ? "h-12 border border-input px-4 focus-visible:border-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--foreground)]"
          : "h-12 border-0 border-b border-input px-0 focus-visible:border-foreground focus-visible:shadow-[inset_0_-1px_0_0_var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        fieldBase,
        "min-h-28 border border-input px-4 py-3 focus-visible:border-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-2 block text-body-sm font-medium text-foreground", className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-2 text-caption text-muted-foreground", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return <p role="alert" className={cn("mt-2 text-caption text-danger", className)} {...props} />;
}
