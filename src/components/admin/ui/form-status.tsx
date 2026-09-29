"use client";

import { useEffect, useRef } from "react";

import { CheckIcon } from "@/components/icons";
import type { AdminActionResult } from "@/lib/admin/auth";
import { cn } from "@/lib/utils";

import { useAdminForm } from "./admin-form";

export interface FormStatusProps {
  /**
   * The latest result of the form's action; null before the first submit. Inside
   * an AdminForm leave it out: the form's own result is used.
   */
  result?: AdminActionResult<unknown> | null;
  /** Outside an AdminForm: on a failure, focus the first invalid field in the surrounding form. Default true. */
  focusInvalid?: boolean;
  className?: string;
}

/**
 * The success or error line for a form, in a polite live region that is always
 * present (so screen readers announce each new result). Place it beside the
 * submit button:
 *
 *   <AdminForm action={saveProduct}> … <SubmitButton>Save</SubmitButton> <FormStatus /> </AdminForm>
 */
export function FormStatus({ result: resultProp, focusInvalid = true, className }: FormStatusProps) {
  const form = useAdminForm();
  const result = resultProp !== undefined ? resultProp : (form?.result ?? null);
  const ref = useRef<HTMLDivElement>(null);
  // AdminForm moves focus itself.
  const shouldFocus = focusInvalid && !form;

  useEffect(() => {
    if (!shouldFocus || !result || result.ok || !result.fieldErrors) return;
    const element = ref.current?.closest("form");
    element?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [result, shouldFocus]);

  return (
    <div ref={ref} role="status" aria-live="polite" className={cn("min-w-0 text-body-sm", className)}>
      {result ? (
        result.ok ? (
          result.message ? (
            <p className="flex items-start gap-2 text-success">
              <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-base" />
              <span>{result.message}</span>
            </p>
          ) : null
        ) : (
          <p className="text-danger">{result.message}</p>
        )
      ) : null}
    </div>
  );
}
