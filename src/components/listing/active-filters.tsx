"use client";

import * as React from "react";

import { CloseIcon } from "@/components/icons";
import { findPriceBand, priceBandLabel } from "@/lib/catalog/listing-params";
import type { ProductFacets } from "@/lib/catalog/types";

import { useListing } from "./listing-provider";

interface Tag {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * The active filters as removable tags above the results — what is applied, and
 * one press to undo any of it. Focus moves to a neighbouring tag (or the results)
 * so it is never dropped when a tag disappears.
 */
export function ActiveFilters({ facets }: { facets: ProductFacets }) {
  const { params, update, clearFilters, resultsRef } = useListing();
  const listRef = React.useRef<HTMLUListElement>(null);

  const tags: Tag[] = [];

  if (params.collection) {
    const option = facets.collections.find((item) => item.value === params.collection);
    if (option) tags.push({ key: "collection", label: option.label, remove: () => update({ collection: null }) });
  }
  for (const size of params.sizes) {
    const option = facets.sizes.find((item) => item.value === size);
    if (option) {
      tags.push({
        key: `size-${size}`,
        label: `Size ${option.label}`,
        remove: () => update({ sizes: params.sizes.filter((value) => value !== size) }),
      });
    }
  }
  for (const color of params.colors) {
    const option = facets.colors.find((item) => item.value === color);
    if (option) {
      tags.push({
        key: `color-${color}`,
        label: option.label,
        remove: () => update({ colors: params.colors.filter((value) => value !== color) }),
      });
    }
  }
  const band = findPriceBand(params.price);
  if (band) tags.push({ key: "price", label: priceBandLabel(band), remove: () => update({ price: null }) });
  if (params.inStock) tags.push({ key: "stock", label: "In stock", remove: () => update({ inStock: false }) });

  if (tags.length === 0) return null;

  const restoreFocus = (index: number) => {
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
      const next = buttons?.[Math.min(index, buttons.length - 1)];
      (next ?? resultsRef.current)?.focus();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
      <h2 className="sr-only">Active filters</h2>
      <ul ref={listRef} className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <li key={tag.key}>
            <button
              type="button"
              onClick={() => {
                tag.remove();
                restoreFocus(index);
              }}
              className="group/tag inline-flex h-9 items-center gap-2 border border-border-strong pr-2 pl-3 text-caption transition-colors duration-300 ease-editorial hover:border-foreground"
            >
              {tag.label}
              <CloseIcon aria-hidden="true" className="text-sm opacity-60 transition-opacity group-hover/tag:opacity-100" />
              <span className="sr-only">, remove filter</span>
            </button>
          </li>
        ))}
      </ul>
      {tags.length > 1 ? (
        <button
          type="button"
          onClick={() => {
            clearFilters();
            requestAnimationFrame(() => resultsRef.current?.focus());
          }}
          className="inline-flex h-9 items-center text-caption"
        >
          <span className="link-underline-static pb-0.5">Clear all</span>
        </button>
      ) : null}
    </div>
  );
}
