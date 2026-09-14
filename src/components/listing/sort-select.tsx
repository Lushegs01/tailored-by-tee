"use client";

import * as React from "react";

import { ChevronDownIcon } from "@/components/icons";
import { shopConfig } from "@/config/shop";
import { isProductSort } from "@/lib/catalog/listing-params";

import { useListing } from "./listing-provider";

/**
 * Native select: the platform's own picker on phones, full keyboard support
 * everywhere. Choosing the listing's default clears the parameter, keeping URLs canonical.
 */
export function SortSelect() {
  const { params, defaultSort, update } = useListing();
  const id = React.useId();

  return (
    <div className="flex items-center gap-3">
      {/* Visible from sm; on phones the select's own value says enough. */}
      <label htmlFor={id} className="sr-only text-label text-muted-foreground sm:not-sr-only">
        Sort
      </label>
      <div className="relative">
        <select
          id={id}
          value={params.sort ?? defaultSort}
          onChange={(event) => {
            const next = event.target.value;
            if (isProductSort(next)) update({ sort: next === defaultSort ? null : next });
          }}
          className="h-11 max-w-44 cursor-pointer appearance-none truncate bg-transparent pr-6 text-label text-foreground sm:max-w-none"
        >
          {shopConfig.sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-base"
        />
      </div>
    </div>
  );
}
