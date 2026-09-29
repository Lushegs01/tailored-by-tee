"use client";

import { useState } from "react";

import { createProductAction } from "@/app/admin/products/actions";
import {
  AdminForm,
  AdminSection,
  FormStatus,
  MoneyField,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/admin/ui";
import {
  PRODUCT_CODE_LENGTH,
  PRODUCT_FIELD_LIMITS,
  exampleProductSku,
  normaliseProductCode,
  suggestProductCode,
} from "@/lib/admin/product-schema";
import { productStorefrontPath, suggestProductSlug } from "@/lib/admin/slug";

import { CODE_HINT, NAME_HINT, PRICE_HINT } from "./product-copy";

export interface NewProductFormProps {
  categories: { id: string; name: string; slug: string; code: string }[];
  /** Product codes already in use, so a free one can be suggested. */
  takenCodes: string[];
  /** Web addresses already in use, so the preview shows the one the piece will get. */
  takenSlugs: string[];
}

/**
 * /admin/products/new: the few facts a piece can't exist without. It is created
 * as a draft — hidden from the shop — and the editor opens next for its words,
 * photos, colours, sizes and stock.
 */
export function NewProductForm({ categories, takenCodes, takenSlugs }: NewProductFormProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");

  const shownCode = codeEdited ? code : (suggestProductCode(name, takenCodes) ?? "");
  const categoryCode = categories.find((category) => category.id === categoryId)?.code ?? "";
  const slug = suggestProductSlug(name, takenSlugs);

  return (
    <AdminForm action={createProductAction} className="space-y-6">
      <AdminSection title="The piece">
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            name="name"
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={PRODUCT_FIELD_LIMITS.name}
            autoComplete="off"
            required
            hint={
              slug ? (
                <>
                  {NAME_HINT} Its address in the shop will be{" "}
                  <span className="font-mono break-all text-foreground">{productStorefrontPath(slug)}</span>, which
                  you can change afterwards.
                </>
              ) : (
                NAME_HINT
              )
            }
          />

          <SelectField
            name="categoryId"
            label="Category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            placeholder={categories.length === 0 ? "No categories yet" : undefined}
            required
            hint="Every piece belongs to exactly one. You can move it later."
          />

          <MoneyField
            name="price"
            label="Price"
            inputMode="decimal"
            required
            hint={PRICE_HINT}
            className="max-w-xs"
          />

          <TextField
            name="code"
            label="SKU code"
            value={shownCode}
            onChange={(event) => {
              setCode(normaliseProductCode(event.target.value));
              setCodeEdited(true);
            }}
            maxLength={PRODUCT_CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className="max-w-xs"
            hint={
              <>
                {CODE_HINT} SKUs will look like{" "}
                <span className="font-mono">{exampleProductSku(categoryCode, shownCode)}</span>.
                {!codeEdited && shownCode ? " Suggested from the name — change it if you like." : ""}
              </>
            }
          />
        </div>
      </AdminSection>

      <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
        <SubmitButton pendingLabel="Creating…" className="sm:shrink-0" disabled={categories.length === 0}>
          Create draft
        </SubmitButton>
        <FormStatus />
      </div>
    </AdminForm>
  );
}
