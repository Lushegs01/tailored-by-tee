"use client";

import { useState } from "react";

import { saveProductSeo } from "@/app/admin/products/actions";
import { TextAreaField, TextField } from "@/components/admin/ui";
import {
  PRODUCT_FIELD_LIMITS,
  SEO_DESCRIPTION_RECOMMENDED,
  SEO_TITLE_RECOMMENDED,
  counterState,
  seoDescriptionFallback,
  seoTitleFallback,
  type CounterState,
} from "@/lib/admin/product-schema";
import { productStorefrontPath } from "@/lib/admin/slug";
import { cn } from "@/lib/utils";

import { SEO_DESCRIPTION_HINT, SEO_INTRO, SEO_TITLE_HINT } from "./product-copy";
import { ProductSectionForm } from "./product-section-form";

export interface ProductSeoFormProps {
  id: string;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  /** What the shop falls back to when these are empty. */
  productName: string;
  categoryName: string;
  summary: string;
  slug: string;
  /** The shop's address, e.g. "https://tailoredbytee.com". */
  siteUrl: string;
}

/**
 * "Search engines": the title and description Google shows, with a preview of the
 * result and a count of the characters that usually survive. Both fields may be
 * left empty — the shop then uses the name and the summary, which suits most
 * pieces.
 */
export function ProductSeoForm({
  id,
  updatedAt,
  seoTitle,
  seoDescription,
  productName,
  categoryName,
  summary,
  slug,
  siteUrl,
}: ProductSeoFormProps) {
  const [title, setTitle] = useState(seoTitle ?? "");
  const [description, setDescription] = useState(seoDescription ?? "");

  const titleFallback = seoTitleFallback(productName, categoryName);
  const descriptionFallback = seoDescriptionFallback(summary);
  const shownTitle = title.trim() || titleFallback;
  const shownDescription = description.trim() || descriptionFallback;

  return (
    <ProductSectionForm
      id={id}
      updatedAt={updatedAt}
      action={saveProductSeo}
      anchor="seo"
      title="Search engines"
      description={SEO_INTRO}
      saveLabel="Save search details"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <TextField
              name="seoTitle"
              label="Search title"
              optional
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={PRODUCT_FIELD_LIMITS.seoTitle}
              autoComplete="off"
              hint={SEO_TITLE_HINT}
            />
            <Counter length={title.trim().length} recommended={SEO_TITLE_RECOMMENDED} noun="title" />
          </div>

          <div>
            <TextAreaField
              name="seoDescription"
              label="Search description"
              optional
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={PRODUCT_FIELD_LIMITS.seoDescription}
              rows={4}
              hint={SEO_DESCRIPTION_HINT}
            />
            <Counter
              length={description.trim().length}
              recommended={SEO_DESCRIPTION_RECOMMENDED}
              noun="description"
            />
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-label">How it may look on Google</p>
          <p className="mt-1.5 text-caption text-muted-foreground">
            An impression, not a promise: search engines often write their own wording from the page.
          </p>

          <div className="mt-3 border p-4">
            <p className="truncate text-caption text-muted-foreground">
              {displayHost(siteUrl)}
              <span aria-hidden="true"> › </span>
              <span className="sr-only"> then </span>
              {productStorefrontPath(slug).replace(/^\//, "").replace(/\//g, " › ")}
            </p>
            <p className="mt-1.5 text-body underline decoration-1 underline-offset-2">{clamp(shownTitle, 70)}</p>
            <p className="mt-1 text-body-sm text-muted-foreground">{clamp(shownDescription, 170)}</p>
          </div>

          <ul className="mt-3 space-y-1 text-caption text-muted-foreground">
            <li>
              {title.trim()
                ? "Using the search title above."
                : `Empty, so the shop uses “${titleFallback}”.`}
            </li>
            <li>
              {description.trim()
                ? "Using the search description above."
                : descriptionFallback
                  ? "Empty, so the shop uses the summary from “Basics”."
                  : "Empty, and there is no summary yet — write one under “Basics” so search results have a line to show."}
            </li>
          </ul>
        </div>
      </div>
    </ProductSectionForm>
  );
}

const COUNTER_TONES: Record<CounterState, string> = {
  ok: "text-muted-foreground",
  near: "text-muted-foreground",
  over: "text-accent-brand",
};

/** How many characters have been written, and whether that is past what search results show. */
function Counter({ length, recommended, noun }: { length: number; recommended: number; noun: string }) {
  const state = counterState(length, recommended);
  return (
    <p className={cn("mt-1.5 text-caption tabular-nums", COUNTER_TONES[state])} aria-live="polite">
      {length} of about {recommended} characters
      {state === "over" ? ` — a longer ${noun} is usually cut short in search results.` : "."}
    </p>
  );
}

/** "https://tailoredbytee.com/" → "tailoredbytee.com". */
function displayHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}
