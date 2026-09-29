"use client";

import { useId, useState } from "react";

import {
  addProductSizes,
  createProductSize,
  moveProductSize,
  removeProductOption,
  setProductOptionVariantsActive,
} from "@/app/admin/products/[id]/variant-actions";
import {
  AdminEmptyState,
  AdminSection,
  SelectChevron,
  SelectField,
  TextField,
  adminSelectClassName,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { formatNumber } from "@/lib/admin/format";
import { SIZE_CODE_MAX, suggestSizeCode } from "@/lib/admin/sku";
import type { SizeSystem } from "@/generated/prisma/enums";

import { DialogNote, FormDialog } from "./form-dialog";
import { OptionPicker, type PickerItem } from "./option-picker";
import { OptionRow } from "./option-row";
import {
  MAX_PRODUCT_SIZES,
  SIZE_LABEL_MAX,
  SIZE_SYSTEMS,
  SIZE_SYSTEM_LABELS,
  optionUsage,
  productSizeSystem,
  sizeSystemLabel,
  variantCount,
  type OptionSize,
  type RegistrySize,
  type VariantView,
} from "./variant-rules";

/*
 * The product's sizes, smallest first. A product's sizes all come from one kind
 * — clothing, waist, belt or one size — because the size guide and the shop's
 * size filter rely on it, so once the first size is added the kind is settled.
 * Sizes are shared across the catalogue, like colours.
 */

export interface SizesPanelProps {
  productId: string;
  sizes: readonly OptionSize[];
  variants: readonly VariantView[];
  registry: readonly RegistrySize[];
  /** Announces a saved change on the section's confirmation line. */
  announce: (message: string) => void;
}

export function SizesPanel({ productId, sizes, variants, registry, announce }: SizesPanelProps) {
  const [dialog, setDialog] = useState<"add" | "create" | null>(null);

  const system = productSizeSystem(sizes);
  const onProduct = new Set(sizes.map((size) => size.id));
  const oneSizeDone = system === "ONE_SIZE" && sizes.length > 0;
  const full = sizes.length >= MAX_PRODUCT_SIZES || oneSizeDone;

  return (
    <AdminSection
      title="Sizes"
      description={
        system
          ? `${sizeSystemLabel(system)} — ${SIZE_SYSTEM_LABELS[system].hint} A product’s sizes all come from one kind.`
          : "The sizes this piece is made in. A product’s sizes all come from one kind: clothing, waist, belt or one size."
      }
      flush
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => setDialog("add")}>
            Add sizes
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setDialog("create")}>
            New size
          </Button>
          {oneSizeDone ? (
            <p className="text-caption text-muted-foreground">A one-size product has just one size.</p>
          ) : sizes.length >= MAX_PRODUCT_SIZES ? (
            <p className="text-caption text-muted-foreground">A product can have up to {MAX_PRODUCT_SIZES} sizes.</p>
          ) : null}
        </div>
      }
    >
      {sizes.length === 0 ? (
        <div className="p-4 md:p-5">
          <AdminEmptyState
            title="No sizes yet"
            body="Add the sizes this piece is made in. The first one settles which kind of sizes the product uses."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {sizes.map((size, index) => {
            const usage = optionUsage(variants.filter((variant) => variant.sizeId === size.id));
            return (
              <OptionRow
                key={size.id}
                kind="size"
                name={`size ${size.label}`}
                sentenceName={`Size ${size.label}`}
                title={size.label}
                meta={sizeMeta(size, usage.variants, usage.active)}
                index={index}
                count={sizes.length}
                usage={usage}
                announce={announce}
                move={(direction) => moveProductSize({ productId, sizeId: size.id, direction })}
                remove={() => removeProductOption({ productId, kind: "size", optionId: size.id })}
                setVariantsActive={(isActive) =>
                  setProductOptionVariantsActive({ productId, kind: "size", optionId: size.id, isActive })
                }
              />
            );
          })}
        </ul>
      )}

      <AddSizesDialog
        open={dialog === "add"}
        onOpenChange={(open) => setDialog(open ? "add" : null)}
        productId={productId}
        system={system}
        onProduct={onProduct}
        registry={registry}
        announce={announce}
      />

      <NewSizeDialog
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : null)}
        productId={productId}
        system={system}
        registry={registry}
        announce={announce}
      />
    </AdminSection>
  );
}

function sizeMeta(size: OptionSize, variantsOnSize: number, active: number) {
  const parts = [
    `code ${size.code}`,
    variantsOnSize === 0 ? "no variants yet" : variantCount(variantsOnSize),
  ];
  if (variantsOnSize > 0 && active === 0) parts.push("switched off");
  return <span className="tabular-nums">{parts.join(", ")}</span>;
}

/* ── Adding sizes from the registry ─────────────────────────────────────── */

function AddSizesDialog({
  open,
  onOpenChange,
  productId,
  system,
  onProduct,
  registry,
  announce,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  system: SizeSystem | null;
  onProduct: ReadonlySet<string>;
  registry: readonly RegistrySize[];
  announce: (message: string) => void;
}) {
  const [chosen, setChosen] = useState<SizeSystem>(system ?? "APPAREL");
  const active = system ?? chosen;

  const items: PickerItem[] = registry
    .filter((size) => size.system === active && !onProduct.has(size.id))
    .map((size) => ({
      id: size.id,
      label: size.label,
      keywords: `${size.code} ${sizeSystemLabel(size.system)}`,
      caption: `code ${size.code}, ${
        size.productCount === 0
          ? "not used yet"
          : `on ${formatNumber(size.productCount)} ${size.productCount === 1 ? "product" : "products"}`
      }`,
    }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add sizes"
      description="Choose from the sizes already in your catalogue."
      action={addProductSizes}
      submitLabel="Add sizes"
      pendingLabel="Adding…"
      onSaved={(message) => announce(message ?? "Sizes added.")}
    >
      <input type="hidden" name="productId" value={productId} />

      {system ? null : (
        <SystemChooser
          value={chosen}
          onChange={setChosen}
          hint="This settles the kind of sizes the product uses. It can’t be mixed with another kind later."
        />
      )}

      {/* Remount the list when the kind changes, so nothing ticked under the old kind is sent. */}
      <OptionPicker
        key={active}
        name="sizeId"
        legend="Sizes to add"
        items={items}
        searchLabel="Search sizes"
        searchPlaceholder="Size or code, e.g. XL or 32"
        noun={{ one: "size", other: "sizes" }}
        empty={
          <>
            Every {sizeSystemLabel(active).toLowerCase().replace(/ sizes$/, "")} size in your catalogue is already on
            this product. Close this and choose <strong className="font-medium">New size</strong> to make another.
          </>
        }
      />

      <DialogNote>
        Sizes go in smallest-first order automatically. Nothing is on sale until you create their variants.
      </DialogNote>
    </FormDialog>
  );
}

/* ── Creating a size ────────────────────────────────────────────────────── */

function NewSizeDialog({
  open,
  onOpenChange,
  productId,
  system,
  registry,
  announce,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  system: SizeSystem | null;
  registry: readonly RegistrySize[];
  announce: (message: string) => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New size"
      description="Sizes are shared across the catalogue, so use the label customers will read."
      action={createProductSize}
      submitLabel="Create size"
      pendingLabel="Creating…"
      onSaved={(message) => announce(message ?? "Size created.")}
    >
      <input type="hidden" name="productId" value={productId} />
      <NewSizeFields system={system} registry={registry} />
      <DialogNote>
        The code can’t be changed later: it is printed in the SKU of every variant made with this size, on labels and
        packing lists.
      </DialogNote>
    </FormDialog>
  );
}

function NewSizeFields({ system, registry }: { system: SizeSystem | null; registry: readonly RegistrySize[] }) {
  const [chosen, setChosen] = useState<SizeSystem>(system ?? "APPAREL");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  const active = system ?? chosen;
  const sameSystem = registry.filter((size) => size.system === active);
  const taken = registry.map((size) => size.code);
  const suggestion = suggestSizeCode(label, taken);
  const shownCode = codeTouched ? code : (suggestion ?? "");
  const last = sameSystem[sameSystem.length - 1];

  return (
    <div className="space-y-5">
      {system ? (
        <>
          <input type="hidden" name="system" value={system} />
          <p className="text-body-sm text-muted-foreground">
            This product uses {sizeSystemLabel(system).toLowerCase()}, so the new size joins them.
          </p>
        </>
      ) : (
        <SystemChooser
          name="system"
          value={chosen}
          onChange={setChosen}
          hint="This settles the kind of sizes the product uses."
        />
      )}

      <TextField
        name="label"
        label="Size"
        hint="What customers read, e.g. XXXL, 40 or One Size."
        maxLength={SIZE_LABEL_MAX}
        autoComplete="off"
        required
        className="max-w-48"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />

      <SelectField
        key={active}
        name="after"
        label="Where it goes"
        hint="Sizes are always shown smallest first."
        className="max-w-xs"
        defaultValue={last ? last.id : ""}
        options={[
          { value: "", label: sameSystem.length === 0 ? "First size of this kind" : `Before ${sameSystem[0].label}` },
          ...sameSystem.map((size) => ({ value: size.id, label: `After ${size.label}` })),
        ]}
      />

      <TextField
        name="code"
        label="SKU code"
        hint={`Up to ${SIZE_CODE_MAX} capital letters or numbers, used in every SKU for this size. Suggested from the label — change it if you prefer.`}
        maxLength={SIZE_CODE_MAX}
        autoComplete="off"
        spellCheck={false}
        required
        className="max-w-40"
        value={shownCode}
        onChange={(event) => {
          setCodeTouched(true);
          setCode(event.target.value.toUpperCase());
        }}
      />
    </div>
  );
}

/* ── The kind of sizes ──────────────────────────────────────────────────── */

function SystemChooser({
  name,
  value,
  onChange,
  hint,
}: {
  /** Given only when the form sends it. */
  name?: string;
  value: SizeSystem;
  onChange: (system: SizeSystem) => void;
  hint: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 max-w-xs">
      <Label htmlFor={id} className="mb-1.5">
        Kind of sizes
      </Label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value}
          aria-describedby={`${id}-hint`}
          className={adminSelectClassName}
          onChange={(event) => onChange(event.target.value as SizeSystem)}
        >
          {SIZE_SYSTEMS.map((option) => (
            <option key={option} value={option}>
              {SIZE_SYSTEM_LABELS[option].label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
      <p id={`${id}-hint`} className="mt-1.5 text-caption text-muted-foreground">
        {SIZE_SYSTEM_LABELS[value].hint} {hint}
      </p>
    </div>
  );
}
