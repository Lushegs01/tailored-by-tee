"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

import { useAdminForm } from "./admin-form";

export interface SubmitButtonProps extends Omit<ButtonProps, "type" | "asChild"> {
  /** Shown while the form is submitting. Default "Saving…". */
  pendingLabel?: string;
}

/**
 * A form's submit button: disabled with a pending label while its form's action
 * runs. Sit it inside the <form> (or AdminForm). Primary by default — use
 * variant="outline" when the view already has its one filled button. A `name` and
 * `value` are sent with the form, for forms with more than one submit action.
 */
export function SubmitButton({
  pendingLabel = "Saving…",
  variant = "primary",
  size = "sm",
  disabled,
  children,
  ...props
}: SubmitButtonProps) {
  const status = useFormStatus();
  const form = useAdminForm();
  const pending = status.pending || (form?.pending ?? false);

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
