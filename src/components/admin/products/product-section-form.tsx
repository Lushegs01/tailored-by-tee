"use client";

import type { ReactNode } from "react";

import { AdminForm, AdminSection, FormStatus, SubmitButton, type AdminFormAction } from "@/components/admin/ui";

/*
 * One section of the product editor, saved on its own.
 *
 * Each section is a small form of its own so a long page never has to be saved
 * all at once, and a problem in one part never blocks the rest. Two hidden fields
 * travel with every save: the product's id, and the moment the page was built —
 * which the server compares with the row before writing, so a save made from a
 * page someone else has already changed is refused rather than silently
 * overwriting their work.
 *
 * The Save buttons are outline, not filled: the page's one filled button belongs
 * to publishing, which is the act the owner is really here to perform.
 */

export interface ProductSectionFormProps<T> {
  /** The product being edited. */
  id: string;
  /** The product's updatedAt as an ISO string, taken from the page that built this form. */
  updatedAt: string;
  action: AdminFormAction<T>;
  /** The anchor the "On this page" links use. */
  anchor: string;
  title: string;
  description?: ReactNode;
  /** The verb on the save button, e.g. "Save basics". */
  saveLabel: string;
  children: ReactNode;
}

export function ProductSectionForm<T>({
  id,
  updatedAt,
  action,
  anchor,
  title,
  description,
  saveLabel,
  children,
}: ProductSectionFormProps<T>) {
  return (
    <AdminForm action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <AdminSection
        id={anchor}
        className="scroll-mt-20 lg:scroll-mt-8"
        title={title}
        description={description}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SubmitButton variant="outline" className="sm:shrink-0">
              {saveLabel}
            </SubmitButton>
            <FormStatus />
          </div>
        }
      >
        {children}
      </AdminSection>
    </AdminForm>
  );
}
