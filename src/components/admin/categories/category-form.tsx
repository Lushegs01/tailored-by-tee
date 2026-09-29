"use client";

import { useState } from "react";

import { createCategoryAction, updateCategoryAction } from "@/app/admin/categories/actions";
import { NameSlugFields } from "@/components/admin/collections/name-slug-fields";
import { PLACE_FIRST, positionOptions } from "@/components/admin/collections/ordering";
import type { ShopReference } from "@/components/admin/collections/shop-references";
import { MediaField } from "@/components/admin/media/media-field";
import {
  AdminForm,
  AdminSection,
  FormStatus,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/admin/ui";
import type { AdminMedia } from "@/lib/admin/media";

import {
  CATEGORY_CODE_HINT,
  CATEGORY_DESCRIPTION_HINT,
  CATEGORY_IMAGE_HINT,
  CATEGORY_ORDER_HINT,
  lockedCodeExplanation,
} from "./category-copy";
import { CATEGORY_CODE_LENGTH, exampleSku, suggestCategoryCode } from "./category-code";

/** Field limits, kept in step with lib/admin/categories (CATEGORY_FIELD_LIMITS). */
const LIMITS = { name: 60, description: 500 } as const;

export interface CategoryFormValues {
  name: string;
  slug: string;
  code: string;
  description: string;
  image: AdminMedia | null;
}

/** Keeps what the owner types to three capital letters. */
function cleanCodeInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, CATEGORY_CODE_LENGTH);
}

export function NewCategoryForm({
  others,
  takenCodes,
}: {
  others: { id: string; name: string }[];
  takenCodes: string[];
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const shownCode = codeEdited ? code : suggestCategoryCode(name, takenCodes);
  const placeAfter = others.at(-1)?.id ?? PLACE_FIRST;

  return (
    <AdminForm action={createCategoryAction} className="space-y-6">
      <AdminSection title="Details">
        <div className="grid gap-5 md:grid-cols-2">
          <NameSlugFields
            kind="category"
            defaultName=""
            savedSlug={null}
            nameMaxLength={LIMITS.name}
            nameHint="As shoppers see it in the menu, e.g. Shirts."
            references={[]}
            liveInShop={false}
            onNameChange={setName}
          />
          <TextField
            name="code"
            label="SKU code"
            value={shownCode}
            onChange={(event) => {
              setCode(cleanCodeInput(event.target.value));
              setCodeEdited(true);
            }}
            maxLength={CATEGORY_CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className="max-w-xs"
            hint={
              <>
                {CATEGORY_CODE_HINT} SKUs will look like <span className="font-mono">{exampleSku(shownCode)}</span>.
                {!codeEdited && shownCode ? " Suggested from the name — change it if you like." : ""}
              </>
            }
          />
          <DescriptionField defaultValue="" />
        </div>
      </AdminSection>

      <CategoryPhotoAndPosition image={null} others={others} placeAfter={placeAfter} />
      <SaveBar label="Create category" pendingLabel="Creating…" />
    </AdminForm>
  );
}

export interface EditCategoryFormProps {
  id: string;
  values: CategoryFormValues;
  others: { id: string; name: string }[];
  placeAfter: string;
  /** SKUs in the category; above zero locks the code. */
  variantCount: number;
  references: ShopReference[];
  liveProductCount: number;
}

export function EditCategoryForm({
  id,
  values,
  others,
  placeAfter,
  variantCount,
  references,
  liveProductCount,
}: EditCategoryFormProps) {
  const locked = variantCount > 0;
  const [code, setCode] = useState(values.code);

  return (
    <AdminForm action={updateCategoryAction} className="space-y-6">
      <input type="hidden" name="id" value={id} />
      <AdminSection title="Details">
        <div className="grid gap-5 md:grid-cols-2">
          <NameSlugFields
            kind="category"
            defaultName={values.name}
            savedSlug={values.slug}
            nameMaxLength={LIMITS.name}
            nameHint="As shoppers see it in the menu, e.g. Shirts."
            references={references}
            liveInShop={liveProductCount > 0}
          />
          {locked ? (
            <TextField
              name="lockedCode"
              label="SKU code"
              value={values.code}
              readOnly
              className="max-w-xs"
              hint={lockedCodeExplanation(values.code, variantCount)}
            />
          ) : (
            <TextField
              name="code"
              label="SKU code"
              value={code}
              onChange={(event) => setCode(cleanCodeInput(event.target.value))}
              maxLength={CATEGORY_CODE_LENGTH}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              className="max-w-xs"
              hint={
                <>
                  {CATEGORY_CODE_HINT} SKUs will look like <span className="font-mono">{exampleSku(code)}</span>.
                </>
              }
            />
          )}
          <DescriptionField defaultValue={values.description} />
        </div>
      </AdminSection>

      <CategoryPhotoAndPosition image={values.image} others={others} placeAfter={placeAfter} />
      <SaveBar label="Save changes" pendingLabel="Saving…" />
    </AdminForm>
  );
}

function DescriptionField({ defaultValue }: { defaultValue: string }) {
  return (
    <TextAreaField
      name="description"
      label="Description"
      defaultValue={defaultValue}
      maxLength={LIMITS.description}
      rows={3}
      required
      className="md:col-span-2"
      hint={CATEGORY_DESCRIPTION_HINT}
    />
  );
}

function CategoryPhotoAndPosition({
  image,
  others,
  placeAfter,
}: {
  image: AdminMedia | null;
  others: { id: string; name: string }[];
  placeAfter: string;
}) {
  return (
    <AdminSection title="Photo and position">
      <div className="space-y-6">
        <MediaField name="imageId" label="Photo" defaultValue={image} hint={CATEGORY_IMAGE_HINT} />
        <SelectField
          name="placeAfter"
          label="Position"
          options={positionOptions(others)}
          defaultValue={placeAfter}
          hint={`${CATEGORY_ORDER_HINT} You can also move categories up and down in the list.`}
          className="max-w-md"
        />
        <input type="hidden" name="originalPlaceAfter" value={placeAfter} />
      </div>
    </AdminSection>
  );
}

function SaveBar({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
      <SubmitButton pendingLabel={pendingLabel} className="sm:shrink-0">
        {label}
      </SubmitButton>
      <FormStatus />
    </div>
  );
}
