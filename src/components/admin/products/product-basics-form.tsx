"use client";

import { useState } from "react";

import { saveProductBasics } from "@/app/admin/products/actions";
import { KeyValueList, ListField, TextAreaField, TextField } from "@/components/admin/ui";
import {
  MAX_CARE,
  MAX_DETAILS,
  PRODUCT_CODE_LENGTH,
  PRODUCT_FIELD_LIMITS,
  exampleProductSku,
  normaliseProductCode,
} from "@/lib/admin/product-schema";

import {
  CARE_HINT,
  CODE_HINT,
  DESCRIPTION_HINT,
  DETAILS_HINT,
  FIT_HINT,
  MATERIAL_HINT,
  MODEL_NOTE_HINT,
  SUMMARY_HINT,
  lockedCodeExplanation,
} from "./product-copy";
import { ProductNameSlugFields } from "./product-name-slug-fields";
import { ProductSectionForm } from "./product-section-form";

export interface ProductBasicsFormProps {
  id: string;
  updatedAt: string;
  values: {
    name: string;
    slug: string;
    code: string;
    summary: string;
    description: string;
    details: string[];
    material: string;
    care: string[];
    fit: string | null;
    modelNote: string | null;
  };
  /** The SKU code is printed in every variant, so it is settled once one exists. */
  variantCount: number;
  categoryCode: string;
  liveInShop: boolean;
}

/**
 * "Basics": everything a customer reads about the piece, plus its address in the
 * shop and the three-letter code its SKUs are built from.
 */
export function ProductBasicsForm({
  id,
  updatedAt,
  values,
  variantCount,
  categoryCode,
  liveInShop,
}: ProductBasicsFormProps) {
  const codeLocked = variantCount > 0;
  const [code, setCode] = useState(values.code);

  return (
    <ProductSectionForm
      id={id}
      updatedAt={updatedAt}
      action={saveProductBasics}
      anchor="basics"
      title="Basics"
      description="The name, the address in the shop, and everything customers read on the product page."
      saveLabel="Save basics"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <ProductNameSlugFields defaultName={values.name} savedSlug={values.slug} liveInShop={liveInShop} />

        {codeLocked ? (
          <KeyValueList
            className="md:col-span-2"
            items={[
              {
                label: "SKU code",
                value: (
                  <>
                    <span className="font-mono">{values.code}</span>
                    <span className="mt-1 block text-caption text-muted-foreground">
                      {lockedCodeExplanation(values.code, variantCount)}
                    </span>
                  </>
                ),
              },
            ]}
          />
        ) : (
          <TextField
            name="code"
            label="SKU code"
            value={code}
            onChange={(event) => setCode(normaliseProductCode(event.target.value))}
            maxLength={PRODUCT_CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className="md:col-span-2 md:max-w-xs"
            hint={
              <>
                {CODE_HINT} SKUs will look like{" "}
                <span className="font-mono">{exampleProductSku(categoryCode, code)}</span>. It can still be changed
                because no variant uses it yet.
              </>
            }
          />
        )}

        <TextField
          name="summary"
          label="Summary"
          defaultValue={values.summary}
          maxLength={PRODUCT_FIELD_LIMITS.summary}
          required
          className="md:col-span-2"
          hint={SUMMARY_HINT}
        />

        <TextAreaField
          name="description"
          label="Description"
          defaultValue={values.description}
          maxLength={PRODUCT_FIELD_LIMITS.description}
          rows={8}
          required
          className="md:col-span-2"
          hint={DESCRIPTION_HINT}
        />

        <ListField
          name="details"
          label="Details"
          itemLabel="detail"
          defaultValue={values.details}
          maxItems={MAX_DETAILS}
          maxLength={PRODUCT_FIELD_LIMITS.detail}
          placeholder="e.g. Camp collar with a single chest pocket"
          hint={DETAILS_HINT}
          className="md:col-span-2"
        />

        <TextField
          name="material"
          label="Material"
          defaultValue={values.material}
          maxLength={PRODUCT_FIELD_LIMITS.material}
          required
          hint={MATERIAL_HINT}
        />

        <ListField
          name="care"
          label="Care"
          itemLabel="care line"
          defaultValue={values.care}
          maxItems={MAX_CARE}
          maxLength={PRODUCT_FIELD_LIMITS.care}
          placeholder="e.g. Cold hand wash"
          hint={CARE_HINT}
        />

        <TextField
          name="fit"
          label="Fit"
          optional
          defaultValue={values.fit ?? ""}
          maxLength={PRODUCT_FIELD_LIMITS.fit}
          hint={FIT_HINT}
        />

        <TextField
          name="modelNote"
          label="Model note"
          optional
          defaultValue={values.modelNote ?? ""}
          maxLength={PRODUCT_FIELD_LIMITS.modelNote}
          hint={MODEL_NOTE_HINT}
        />
      </div>
    </ProductSectionForm>
  );
}
