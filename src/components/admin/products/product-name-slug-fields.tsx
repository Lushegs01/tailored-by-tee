"use client";

import { useState } from "react";

import { Notice } from "@/components/admin/collections/notice";
import { adminControlClassName, CheckboxField, FieldShell, TextField, useFieldIds } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRODUCT_FIELD_LIMITS } from "@/lib/admin/product-schema";
import { PRODUCT_SLUG_MAX, PRODUCT_SLUG_PREFIX, productStorefrontPath, slugify } from "@/lib/admin/slug";
import { cn } from "@/lib/utils";

import { NAME_HINT } from "./product-copy";

/*
 * The name and the web address, working together.
 *
 * The address follows the name until the owner edits it. Changing a saved address
 * says plainly what breaks and asks for a tick (confirmSlugChange) — which the
 * server insists on too, so nothing here is load-bearing. The address is tidied
 * with the shop's own slugify as the field is left, and previewed as the full
 * path a customer would see.
 */

export interface ProductNameSlugFieldsProps {
  defaultName: string;
  /** The saved address; the product editor always has one. */
  savedSlug: string;
  /** Whether customers can reach the saved address right now (the piece is live). */
  liveInShop: boolean;
}

export function ProductNameSlugFields({ defaultName, savedSlug, liveInShop }: ProductNameSlugFieldsProps) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(savedSlug);
  const slugIds = useFieldIds("slug", undefined, true);

  const effectiveSlug = slugify(slug || name);
  const changing = effectiveSlug !== "" && effectiveSlug !== savedSlug;

  return (
    <>
      <TextField
        name="name"
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={PRODUCT_FIELD_LIMITS.name}
        autoComplete="off"
        required
        hint={NAME_HINT}
      />

      <FieldShell
        {...slugIds}
        label="Web address"
        hint={
          <>
            The piece’s address in the shop:{" "}
            <span className="font-mono break-all text-foreground">
              {productStorefrontPath(effectiveSlug || "…")}
            </span>
            .
          </>
        }
      >
        <div className="flex min-w-0">
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center border border-r-0 border-input bg-surface/50 px-2.5 font-mono text-caption text-muted-foreground"
          >
            {PRODUCT_SLUG_PREFIX}
          </span>
          <Input
            name="slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            onBlur={() => setSlug((value) => (value.trim() === "" ? value : slugify(value)))}
            maxLength={PRODUCT_SLUG_MAX + 40}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={cn(adminControlClassName, "min-w-0 flex-1 font-mono")}
            {...slugIds.controlProps}
          />
        </div>
      </FieldShell>

      {changing ? (
        <Notice tone="warning" title="Changing the web address" className="md:col-span-2">
          <p>
            The old address, <span className="font-mono break-all">{productStorefrontPath(savedSlug)}</span>, will
            stop working
            {liveInShop
              ? " — shared links, bookmarks and search results pointing at it will show “page not found”"
              : ""}
            . Nothing sends visitors on to the new one.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CheckboxField
              name="confirmSlugChange"
              label="I understand the old address of this piece will stop working"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setSlug(savedSlug)}
            >
              Keep the current address
            </Button>
          </div>
        </Notice>
      ) : null}
    </>
  );
}
