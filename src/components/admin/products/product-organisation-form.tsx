"use client";

import Link from "next/link";
import { useId } from "react";

import { saveProductOrganisation } from "@/app/admin/products/actions";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
  useAdminFieldError,
} from "@/components/admin/ui";
import {
  MAX_BESTSELLER_RANK,
  MAX_COLLECTIONS_PER_PRODUCT,
  MAX_TAGS,
  PRODUCT_BADGE_OPTIONS,
  PRODUCT_FIELD_LIMITS,
  formatTags,
} from "@/lib/admin/product-schema";

import {
  BADGE_HINT,
  BESTSELLER_HINT,
  CATEGORY_HINT,
  COLLECTIONS_HINT,
  FEATURED_HINT,
  TAGS_HINT,
} from "./product-copy";
import { ProductSectionForm } from "./product-section-form";

// Written out rather than imported: lib/admin/collections is server-only, and
// this form runs in the browser.
const NEW_COLLECTION_PATH = "/admin/collections/new";

export interface ProductOrganisationFormProps {
  id: string;
  updatedAt: string;
  values: {
    categoryId: string;
    collectionIds: string[];
    tags: string[];
    badge: string | null;
    isFeatured: boolean;
    bestsellerRank: number | null;
  };
  categories: { id: string; name: string }[];
  collections: { id: string; name: string; isPublished: boolean }[];
}

/** "Organisation": where the piece sits in the shop — its category, collections, tags and badge. */
export function ProductOrganisationForm({
  id,
  updatedAt,
  values,
  categories,
  collections,
}: ProductOrganisationFormProps) {
  return (
    <ProductSectionForm
      id={id}
      updatedAt={updatedAt}
      action={saveProductOrganisation}
      anchor="organisation"
      title="Organisation"
      description="Where the piece appears in the shop, and how it is found."
      saveLabel="Save organisation"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <SelectField
          name="categoryId"
          label="Category"
          defaultValue={values.categoryId}
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
          required
          hint={CATEGORY_HINT}
        />

        <SelectField
          name="badge"
          label="Badge"
          defaultValue={values.badge ?? ""}
          placeholder="No badge"
          options={PRODUCT_BADGE_OPTIONS.map((badge) => ({ value: badge.value, label: badge.label }))}
          hint={BADGE_HINT}
        />

        <CollectionsField
          collections={collections}
          selected={values.collectionIds}
          className="md:col-span-2"
        />

        <TextField
          name="tags"
          label="Tags"
          optional
          defaultValue={formatTags(values.tags)}
          maxLength={MAX_TAGS * (PRODUCT_FIELD_LIMITS.tag + 2)}
          autoComplete="off"
          className="md:col-span-2"
          hint={`${TAGS_HINT} Up to ${MAX_TAGS}.`}
        />

        <NumberField
          name="bestsellerRank"
          label="Best-seller position"
          optional
          defaultValue={values.bestsellerRank ?? ""}
          maxLength={String(MAX_BESTSELLER_RANK).length}
          hint={BESTSELLER_HINT}
          className="max-w-xs"
        />

        <CheckboxField
          name="isFeatured"
          label="Feature this piece"
          defaultChecked={values.isFeatured}
          hint={FEATURED_HINT}
          className="md:self-end md:pb-2"
        />
      </div>
    </ProductSectionForm>
  );
}

/**
 * The collections this piece belongs to, as a plain checkbox group inside a
 * fieldset: every option visible at once, keyboard-operable, and no dependency.
 * A newly ticked collection puts the piece at the end of that collection; the
 * order within a collection is changed on the collection's own page.
 */
function CollectionsField({
  collections,
  selected,
  className,
}: {
  collections: { id: string; name: string; isPublished: boolean }[];
  selected: string[];
  className?: string;
}) {
  const error = useAdminFieldError("collectionIds");
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = error ? `${baseId}-error` : undefined;
  const chosen = new Set(selected);

  return (
    <fieldset className={className} aria-describedby={[hintId, errorId].filter(Boolean).join(" ")}>
      <legend className="mb-1.5 text-label">Collections</legend>

      {collections.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          There are no collections yet.{" "}
          <Link href={NEW_COLLECTION_PATH} className="link-underline-static pb-0.5 text-foreground">
            Create one
          </Link>{" "}
          to group pieces into a campaign or drop.
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {collections.map((collection) => (
            <label
              key={collection.id}
              className="flex min-h-10 cursor-pointer items-center gap-3 py-1 text-body-sm"
            >
              <input
                type="checkbox"
                name="collectionIds"
                value={collection.id}
                defaultChecked={chosen.has(collection.id)}
                className="size-4 shrink-0 cursor-pointer accent-foreground"
              />
              <span className="min-w-0">
                {collection.name}
                {collection.isPublished ? null : (
                  <span className="text-muted-foreground"> — hidden from the shop</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
        {COLLECTIONS_HINT} Up to {MAX_COLLECTIONS_PER_PRODUCT}.
      </p>
      {error ? (
        <p id={errorId} className="mt-1.5 text-caption text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
