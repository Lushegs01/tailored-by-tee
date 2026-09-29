"use client";

import { useState, type ReactNode } from "react";

import { adminControlClassName, CheckboxField, FieldShell, TextField, useFieldIds } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { Notice, referenceConsequence, ShopReferenceList } from "./notice";
import type { ShopReference } from "./shop-references";
import { SLUG_MAX, slugify, storefrontPath, storefrontPrefix, type SlugKind } from "./slug-rules";

export interface NameSlugFieldsProps {
  kind: SlugKind;
  defaultName: string;
  /** The saved web address when editing; null when creating (the address then follows the name). */
  savedSlug: string | null;
  nameMaxLength: number;
  nameHint?: ReactNode;
  /** Places in the shop's fixed content pointing at the saved address (edit only). */
  references: readonly ShopReference[];
  /** Whether customers can reach the saved address now (published collection, category with live pieces). */
  liveInShop: boolean;
  /** Called as the name changes (e.g. to suggest a category code). */
  onNameChange?: (name: string) => void;
}

/**
 * The name and web address ("slug") fields, working together:
 * - creating: the address follows the name until the owner edits it;
 * - editing: changing the address shows what will break and asks for a tick
 *   (confirmSlugChange), which the server requires too.
 * The address is tidied to letters, numbers and hyphens as the owner leaves the
 * field, and previewed as the full shop path.
 */
export function NameSlugFields({
  kind,
  defaultName,
  savedSlug,
  nameMaxLength,
  nameHint,
  references,
  liveInShop,
  onNameChange,
}: NameSlugFieldsProps) {
  const creating = savedSlug === null;
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(savedSlug ?? slugify(defaultName));
  const [slugEdited, setSlugEdited] = useState(!creating);
  const slugIds = useFieldIds("slug", undefined, true);

  const effectiveSlug = slugify(slug || name);
  const changingSaved = !creating && effectiveSlug !== "" && effectiveSlug !== savedSlug;
  const noun = kind === "collection" ? "collection" : "category";

  function changeName(value: string) {
    setName(value);
    onNameChange?.(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  return (
    <>
      <TextField
        name="name"
        label="Name"
        value={name}
        onChange={(event) => changeName(event.target.value)}
        maxLength={nameMaxLength}
        autoComplete="off"
        required
        hint={nameHint}
      />

      <FieldShell
        {...slugIds}
        label="Web address"
        hint={
          <>
            The page’s address in the shop:{" "}
            <span className="font-mono break-all text-foreground">{storefrontPath(kind, effectiveSlug || "…")}</span>
            {creating ? ". Made from the name unless you change it." : "."}
          </>
        }
      >
        <div className="flex min-w-0">
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center border border-r-0 border-input bg-surface/50 px-2.5 font-mono text-caption text-muted-foreground"
          >
            {storefrontPrefix(kind)}
          </span>
          <Input
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugEdited(true);
            }}
            onBlur={() => setSlug((value) => (value.trim() === "" ? value : slugify(value)))}
            maxLength={SLUG_MAX + 40}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={cn(adminControlClassName, "min-w-0 flex-1 font-mono")}
            {...slugIds.controlProps}
          />
        </div>
      </FieldShell>

      {changingSaved ? (
        <Notice tone="warning" title="Changing the web address" className="md:col-span-2">
          <p>
            The old address, <span className="font-mono break-all">{storefrontPath(kind, savedSlug ?? "")}</span>, will stop
            working
            {liveInShop ? " — for shared links, bookmarks and search results that point to it" : ""}. Nothing
            redirects it to the new one.
          </p>
          {references.length > 0 ? (
            <>
              <p>The shop’s own content points at the old address here:</p>
              <ShopReferenceList references={references} />
              <p>{referenceConsequence(references)}</p>
            </>
          ) : null}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CheckboxField
              name="confirmSlugChange"
              label={`I understand the old address of this ${noun} will stop working`}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => savedSlug !== null && setSlug(savedSlug)}
            >
              Keep the current address
            </Button>
          </div>
        </Notice>
      ) : null}
    </>
  );
}
