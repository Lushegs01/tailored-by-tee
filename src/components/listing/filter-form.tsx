"use client";

import * as React from "react";

import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { shopConfig } from "@/config/shop";
import { priceBandLabel } from "@/lib/catalog/listing-params";
import type { ProductFacets, SizeFacetOption, SizeSystem } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useListing } from "./listing-provider";

export interface FilterFormProps {
  facets: ProductFacets;
  /** Off where the collection is the page itself. */
  showCollection: boolean;
  /** "rail": the desktop column, denser and mouse-first. "sheet": the drawer, with 44px rows. */
  variant: "rail" | "sheet";
}

/**
 * The filter controls, as a real GET form. With JavaScript every change applies
 * at once through the listing provider; without it, the form submits to the same
 * URL the provider would have built. Native inputs throughout, so keyboard use,
 * grouping and checked state come from the platform.
 */
export function FilterForm({ facets, showCollection, variant }: FilterFormProps) {
  const { basePath, params, update } = useListing();
  const dense = variant === "rail";
  const row = cn("flex items-center gap-3 text-body-sm", dense ? "min-h-9" : "min-h-11");

  const toggle = (key: "sizes" | "colors", value: string) => {
    const current = params[key];
    update({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  };

  const sizeGroups = groupSizes(facets.sizes);
  const collections = showCollection ? facets.collections : [];

  return (
    <form method="get" action={basePath} aria-label="Filters" onSubmit={(event) => event.preventDefault()}>
      {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}

      {collections.length > 0 ? (
        <FilterSection title="Collection" activeCount={params.collection ? 1 : 0} dense={dense}>
          <RadioRow
            name="collection"
            value=""
            label="All collections"
            checked={params.collection === null}
            onChange={() => update({ collection: null })}
            className={row}
          />
          {collections.map((option) => (
            <RadioRow
              key={option.value}
              name="collection"
              value={option.value}
              label={option.label}
              count={option.count}
              checked={params.collection === option.value}
              onChange={() => update({ collection: option.value })}
              className={row}
            />
          ))}
        </FilterSection>
      ) : null}

      {sizeGroups.length > 0 ? (
        <FilterSection title="Size" activeCount={params.sizes.length} dense={dense}>
          {sizeGroups.map(([system, options]) => (
            <div key={system} className="mt-4 first:mt-1">
              {sizeGroups.length > 1 ? (
                <p className="mb-2 text-caption text-muted-foreground">{shopConfig.sizeGroupLabels[system]}</p>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                {options.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "relative flex cursor-pointer items-center justify-center border border-border-strong text-caption font-medium tabular-nums",
                      "transition-colors duration-300 ease-editorial hover:border-foreground",
                      "has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background",
                      "has-[:focus-visible]:outline-[1.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
                      dense ? "h-10" : "h-11",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="size"
                      value={option.value}
                      checked={params.sizes.includes(option.value)}
                      onChange={() => toggle("sizes", option.value)}
                      className="sr-only"
                    />
                    <span className="sr-only">Size </span>
                    {option.label}
                    <span className="sr-only">, {pluralize(option.count, "piece")}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </FilterSection>
      ) : null}

      {facets.colors.length > 0 ? (
        <FilterSection title="Colour" activeCount={params.colors.length} dense={dense}>
          <div className="grid grid-cols-2 gap-x-4">
            {facets.colors.map((option) => (
              <label key={option.value} className={cn(row, "min-w-0 cursor-pointer gap-2.5")}>
                <input
                  type="checkbox"
                  name="color"
                  value={option.value}
                  checked={params.colors.includes(option.value)}
                  onChange={() => toggle("colors", option.value)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/15 ring-inset outline-offset-2 peer-checked:outline-1 peer-checked:outline-foreground peer-checked:outline-solid peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-ring peer-focus-visible:outline-solid"
                  style={{ backgroundColor: option.hex }}
                />
                <span className="min-w-0 flex-1 truncate peer-checked:font-medium">{option.label}</span>
                <Count value={option.count} />
              </label>
            ))}
          </div>
        </FilterSection>
      ) : null}

      <FilterSection title="Price" activeCount={params.price ? 1 : 0} dense={dense}>
        <RadioRow
          name="price"
          value=""
          label="Any price"
          checked={params.price === null}
          onChange={() => update({ price: null })}
          className={row}
        />
        {shopConfig.priceBands.map((band) => {
          const count = facets.prices.find((price) => price.value === band.id)?.count ?? 0;
          const checked = params.price === band.id;
          return (
            <RadioRow
              key={band.id}
              name="price"
              value={band.id}
              label={priceBandLabel(band)}
              count={count}
              checked={checked}
              disabled={count === 0 && !checked}
              onChange={() => update({ price: band.id })}
              className={row}
            />
          );
        })}
      </FilterSection>

      <FilterSection title="Availability" activeCount={params.inStock ? 1 : 0} dense={dense}>
        <label className={cn(row, "cursor-pointer")}>
          <span className="relative grid size-4 shrink-0 place-items-center">
            <input
              type="checkbox"
              name="stock"
              value="in"
              checked={params.inStock}
              onChange={() => update({ inStock: !params.inStock })}
              className="peer absolute inset-0 appearance-none border border-border-strong transition-colors duration-200 checked:border-foreground checked:bg-foreground"
            />
            <CheckIcon
              aria-hidden="true"
              strokeWidth={2}
              className="pointer-events-none relative text-[0.75rem] text-background opacity-0 peer-checked:opacity-100"
            />
          </span>
          <span className="flex-1">In stock only</span>
          <Count value={facets.inStock} />
        </label>
      </FilterSection>

      {/* Without JavaScript, changes wait for this. With it, they have already applied. */}
      <noscript>
        <Button type="submit" variant="outline" fullWidth className="mt-6">
          Apply filters
        </Button>
      </noscript>
    </form>
  );
}

/** Size options grouped by system (clothing, waist, belt) in registry order. */
function groupSizes(options: SizeFacetOption[]): [SizeSystem, SizeFacetOption[]][] {
  const groups = new Map<SizeSystem, SizeFacetOption[]>();
  for (const option of options) {
    const group = groups.get(option.system);
    if (group) group.push(option);
    else groups.set(option.system, [option]);
  }
  return [...groups];
}

function Count({ value }: { value: number }) {
  return (
    <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">, {pluralize(value, "piece")}</span>
    </span>
  );
}

function FilterSection({
  title,
  activeCount,
  dense,
  children,
}: {
  title: string;
  activeCount: number;
  dense: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open className="group/section border-b py-3 last:border-b-0">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-4 text-label [&::-webkit-details-marker]:hidden",
          dense ? "min-h-10" : "min-h-12",
        )}
      >
        <span>
          {title}
          {activeCount > 0 ? (
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              <span aria-hidden="true">({activeCount})</span>
              <span className="sr-only">, {activeCount} selected</span>
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="shrink-0 text-base transition-transform duration-300 ease-editorial group-open/section:rotate-180"
        />
      </summary>
      <fieldset className="pb-2 pt-1">
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </details>
  );
}

function RadioRow({
  name,
  value,
  label,
  count,
  checked,
  disabled = false,
  onChange,
  className,
}: {
  name: string;
  value: string;
  label: string;
  count?: number;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  className: string;
}) {
  return (
    <label className={cn(className, disabled ? "cursor-default text-muted-foreground" : "cursor-pointer")}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 appearance-none rounded-full border border-border-strong transition-[border-width,border-color] duration-200 ease-editorial checked:border-[5px] checked:border-foreground disabled:opacity-40"
      />
      <span className="flex-1">{label}</span>
      {count === undefined ? null : <Count value={count} />}
    </label>
  );
}
