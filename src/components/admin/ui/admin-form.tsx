"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";

import type { AdminActionResult } from "@/lib/admin/auth";
import { fieldError } from "@/lib/admin/field-errors";

/*
 * The form wrapper for admin server actions.
 *
 *   // actions.ts ("use server")
 *   export async function saveCategory(_previous: AdminActionResult | null, formData: FormData) {
 *     return withAdmin("category.save", async (admin) => { … });
 *   }
 *
 *   // category-form.tsx ("use client")
 *   <AdminForm action={saveCategory}>
 *     <TextField name="name" label="Name" defaultValue={category.name} />
 *     <SubmitButton>Save category</SubmitButton>
 *     <FormStatus />
 *   </AdminForm>
 *
 * Why not a plain <form action={…}>: React resets a form after its action runs,
 * so a failed save would wipe everything the owner typed. AdminForm submits in a
 * transition instead, which keeps the fields as typed (and still gives
 * SubmitButton its pending state). It also:
 * - hands the latest result to the fields inside it, so each field shows its own
 *   error from `fieldErrors` without wiring (pass `error` to override);
 * - hands the result to FormStatus (no `result` prop needed);
 * - moves focus to the first invalid field after a failed save;
 * - optionally clears the form after a successful save (`resetOnSuccess`, for
 *   "add another" forms) and calls `onSuccess`.
 */

export type AdminFormAction<T> = (
  previous: AdminActionResult<T> | null,
  formData: FormData,
) => Promise<AdminActionResult<T>>;

interface AdminFormContextValue {
  result: AdminActionResult<unknown> | null;
  pending: boolean;
}

const AdminFormContext = createContext<AdminFormContextValue | null>(null);

/** The surrounding AdminForm's latest result and pending state, or null outside one. */
export function useAdminForm(): AdminFormContextValue | null {
  return useContext(AdminFormContext);
}

/**
 * The error to show for field `name`: `explicit` when given (even "", which hides
 * it), otherwise the surrounding AdminForm's error for that field or its parts.
 */
export function useAdminFieldError(name: string, explicit?: string): string | undefined {
  const form = useContext(AdminFormContext);
  if (explicit !== undefined) return explicit || undefined;
  const result = form?.result;
  if (!result || result.ok) return undefined;
  return fieldError(result.fieldErrors, name);
}

type SuccessResult<T> = Extract<AdminActionResult<T>, { ok: true }>;

export interface AdminFormProps<T>
  extends Omit<ComponentProps<"form">, "action" | "onSubmit" | "children" | "method" | "encType"> {
  /** A server action taking (previousResult, formData), usually wrapped in withAdmin. */
  action: AdminFormAction<T>;
  /** Clear the fields after a successful save (forms that add things). Default false: edit forms keep their values. */
  resetOnSuccess?: boolean;
  /** Called once per successful save, after the result has rendered. */
  onSuccess?: (result: SuccessResult<T>) => void;
  /** Plain children, or a function of the latest result and pending state. */
  children: ReactNode | ((form: { result: AdminActionResult<T> | null; pending: boolean }) => ReactNode);
}

/** A <form> bound to an admin server action. See the file comment. */
export function AdminForm<T>({ action, resetOnSuccess = false, onSuccess, children, ...formProps }: AdminFormProps<T>) {
  const [result, dispatch, pending] = useActionState<AdminActionResult<T> | null, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<AdminActionResult<T> | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const resetRef = useRef(resetOnSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    resetRef.current = resetOnSuccess;
  });

  useEffect(() => {
    if (!result || handled.current === result) return;
    handled.current = result;

    if (result.ok) {
      if (resetRef.current) formRef.current?.reset();
      onSuccessRef.current?.(result as SuccessResult<T>);
    } else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [result]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Prevent React's own form-action handling (which would reset the form) but
    // keep its pending state: a transition started in this handler marks the form
    // as submitting for useFormStatus.
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return (
    <AdminFormContext.Provider value={{ result, pending }}>
      <form ref={formRef} action={dispatch} onSubmit={handleSubmit} {...formProps}>
        {typeof children === "function" ? children({ result, pending }) : children}
      </form>
    </AdminFormContext.Provider>
  );
}
