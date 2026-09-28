"use client";

import { useState } from "react";

import { createCollectionAction, updateCollectionAction } from "@/app/admin/collections/actions";
import { MediaField } from "@/components/admin/media/media-field";
import {
  AdminForm,
  AdminSection,
  CheckboxField,
  FormStatus,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/admin/ui";
import type { AdminMedia } from "@/lib/admin/media";

import {
  FEATURED_HINT,
  HERO_HINT,
  PUBLISHED_HINT,
} from "./collection-copy";
import { NameSlugFields } from "./name-slug-fields";
import { Notice, referenceConsequence, ShopReferenceList } from "./notice";
import { PLACE_FIRST, positionOptions } from "./ordering";
import type { ShopReference } from "./shop-references";

/** Field limits, kept in step with lib/admin/collections (COLLECTION_FIELD_LIMITS). */
const LIMITS = { name: 80, code: 40, season: 60, summary: 200, description: 2000 } as const;

export interface CollectionFormValues {
  name: string;
  slug: string;
  code: string | null;
  season: string | null;
  summary: string;
  description: string;
  isPublished: boolean;
  isFeatured: boolean;
  heroImage: AdminMedia | null;
}

interface SharedProps {
  /** The other collections in order (for "Position"). */
  others: { id: string; name: string }[];
}

export function NewCollectionForm({ others }: SharedProps) {
  const values: CollectionFormValues = {
    name: "",
    slug: "",
    code: null,
    season: null,
    summary: "",
    description: "",
    isPublished: false,
    isFeatured: false,
    heroImage: null,
  };
  const placeAfter = others.at(-1)?.id ?? PLACE_FIRST;
  return (
    <AdminForm action={createCollectionAction} className="space-y-6">
      <CollectionFields
        mode="create"
        values={values}
        others={others}
        placeAfter={placeAfter}
        references={[]}
        liveProductCount={0}
      />
      <SaveBar label="Create collection" pendingLabel="Creating…" />
    </AdminForm>
  );
}

export interface EditCollectionFormProps extends SharedProps {
  id: string;
  values: CollectionFormValues;
  placeAfter: string;
  references: ShopReference[];
  liveProductCount: number;
}

export function EditCollectionForm({ id, values, others, placeAfter, references, liveProductCount }: EditCollectionFormProps) {
  return (
    <AdminForm action={updateCollectionAction} className="space-y-6">
      <input type="hidden" name="id" value={id} />
      <CollectionFields
        mode="edit"
        values={values}
        others={others}
        placeAfter={placeAfter}
        references={references}
        liveProductCount={liveProductCount}
      />
      <SaveBar label="Save changes" pendingLabel="Saving…" />
    </AdminForm>
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

function CollectionFields({
  mode,
  values,
  others,
  placeAfter,
  references,
  liveProductCount,
}: {
  mode: "create" | "edit";
  values: CollectionFormValues;
  others: { id: string; name: string }[];
  placeAfter: string;
  references: ShopReference[];
  liveProductCount: number;
}) {
  const [published, setPublished] = useState(values.isPublished);
  const hidingLinked = mode === "edit" && values.isPublished && !published && references.length > 0;

  return (
    <>
      <AdminSection title="Details">
        <div className="grid gap-5 md:grid-cols-2">
          <NameSlugFields
            kind="collection"
            defaultName={values.name}
            savedSlug={mode === "edit" ? values.slug : null}
            nameMaxLength={LIMITS.name}
            nameHint="As shoppers see it, e.g. Harmattan."
            references={references}
            liveInShop={values.isPublished}
          />
          <TextField
            name="code"
            label="Code"
            optional
            defaultValue={values.code ?? ""}
            maxLength={LIMITS.code}
            autoComplete="off"
            hint="A small label above the name, e.g. Collection 04."
          />
          <TextField
            name="season"
            label="Season"
            optional
            defaultValue={values.season ?? ""}
            maxLength={LIMITS.season}
            autoComplete="off"
            hint="e.g. Harmattan 2026."
          />
          <TextField
            name="summary"
            label="Summary"
            defaultValue={values.summary}
            maxLength={LIMITS.summary}
            required
            className="md:col-span-2"
            hint="One line for the collection’s card and the top of its page. Also its description in search results."
          />
          <TextAreaField
            name="description"
            label="Description"
            defaultValue={values.description}
            maxLength={LIMITS.description}
            rows={6}
            required
            className="md:col-span-2"
            hint="A short paragraph under the summary on the collection’s page."
          />
        </div>
      </AdminSection>

      <AdminSection title="Large photo">
        <MediaField name="heroImageId" label="Photo" defaultValue={values.heroImage} hint={HERO_HINT} />
      </AdminSection>

      <AdminSection title="In the shop">
        <div className="space-y-5">
          <CheckboxField
            name="isPublished"
            label="Show in the shop"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            hint={
              mode === "create"
                ? `${PUBLISHED_HINT} Leave it hidden until its pieces and photos are ready.`
                : PUBLISHED_HINT
            }
          />
          {published && mode === "edit" && liveProductCount === 0 ? (
            <Notice tone="warning">
              <p>
                No piece in this collection is live with photos yet, so it will be left off the Collections page
                until one is. Its menu entry and page will still appear.
              </p>
            </Notice>
          ) : null}
          {hidingLinked ? (
            <Notice tone="warning" title="The shop links to this collection">
              <ShopReferenceList references={references} className="mt-0" />
              <p className="mt-2">
                While it’s hidden its page won’t exist. {referenceConsequence(references)}
              </p>
            </Notice>
          ) : null}
          <CheckboxField
            name="isFeatured"
            label="Feature this collection"
            defaultChecked={values.isFeatured}
            hint={FEATURED_HINT}
          />
          <SelectField
            name="placeAfter"
            label="Position"
            options={positionOptions(others)}
            defaultValue={placeAfter}
            hint="Where it sits on the Collections page and in the menu. You can also move collections up and down in the list."
            className="max-w-md"
          />
          <input type="hidden" name="originalPlaceAfter" value={placeAfter} />
        </div>
      </AdminSection>
    </>
  );
}
