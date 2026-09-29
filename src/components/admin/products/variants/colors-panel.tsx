"use client";

import { useState } from "react";

import {
  addProductColors,
  createProductColor,
  moveProductColor,
  removeProductOption,
  setProductOptionVariantsActive,
} from "@/app/admin/products/[id]/variant-actions";
import { ColorSwatch } from "@/components/admin/inventory/color-swatch";
import { AdminEmptyState, AdminSection, FieldShell, TextField, useFieldIds } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/admin/format";
import { COLOR_CODE_LENGTH, suggestColorCode } from "@/lib/admin/sku";

import { DialogNote, FormDialog } from "./form-dialog";
import { OptionPicker, type PickerItem } from "./option-picker";
import { OptionRow } from "./option-row";
import {
  COLOR_NAME_MAX,
  MAX_PRODUCT_COLORS,
  joinWords,
  optionUsage,
  variantCount,
  type ProductColorView,
  type RegistryColor,
  type VariantView,
} from "./variant-rules";

/*
 * The product's colourways, in the order customers see them (the first is the one
 * the product page opens on). Colours are shared across the catalogue — one
 * "Sand" everywhere, so the shop's colour filter stays honest — so they are
 * picked from the registry; a colour that doesn't exist yet can be created here
 * and is then available to every product.
 */

export interface ColorsPanelProps {
  productId: string;
  colors: readonly ProductColorView[];
  variants: readonly VariantView[];
  registry: readonly RegistryColor[];
  /** Announces a saved change on the section's confirmation line. */
  announce: (message: string) => void;
}

export function ColorsPanel({ productId, colors, variants, registry, announce }: ColorsPanelProps) {
  const [dialog, setDialog] = useState<"add" | "create" | null>(null);

  const onProduct = new Set(colors.map((color) => color.id));
  const available = registry.filter((color) => !onProduct.has(color.id));
  const full = colors.length >= MAX_PRODUCT_COLORS;

  const items: PickerItem[] = available.map((color) => ({
    id: color.id,
    label: color.name,
    keywords: `${color.code} ${color.hex}`,
    leading: <ColorSwatch hex={color.hex} className="size-4" />,
    caption: `${color.code}, ${
      color.productCount === 0
        ? "not used yet"
        : `on ${formatNumber(color.productCount)} ${color.productCount === 1 ? "product" : "products"}`
    }`,
  }));

  return (
    <AdminSection
      title="Colours"
      description="The colourways this piece comes in. Each one needs its own photos and variants."
      flush
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => setDialog("add")}>
            Add colours
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setDialog("create")}>
            New colour
          </Button>
          {full ? (
            <p className="text-caption text-muted-foreground">A product can have up to {MAX_PRODUCT_COLORS} colours.</p>
          ) : null}
        </div>
      }
    >
      {colors.length === 0 ? (
        <div className="p-4 md:p-5">
          <AdminEmptyState
            title="No colours yet"
            body="Add the colourways this piece comes in. Variants, photos and the shop’s colour filter all follow from them."
          />
        </div>
      ) : (
        <ul className="divide-y">
          {colors.map((color, index) => {
            const usage = optionUsage(variants.filter((variant) => variant.colorId === color.id));
            return (
              <OptionRow
                key={color.id}
                kind="colour"
                name={color.name}
                leading={<ColorSwatch hex={color.hex} className="size-6" />}
                title={color.name}
                meta={colorMeta(color, usage.variants, usage.active)}
                index={index}
                count={colors.length}
                usage={usage}
                announce={announce}
                move={(direction) => moveProductColor({ productId, colorId: color.id, direction })}
                remove={() => removeProductOption({ productId, kind: "color", optionId: color.id })}
                setVariantsActive={(isActive) =>
                  setProductOptionVariantsActive({ productId, kind: "color", optionId: color.id, isActive })
                }
              />
            );
          })}
        </ul>
      )}

      <FormDialog
        open={dialog === "add"}
        onOpenChange={(open) => setDialog(open ? "add" : null)}
        title="Add colours"
        description="Choose from the colours already in your catalogue."
        action={addProductColors}
        submitLabel="Add colours"
        pendingLabel="Adding…"
        onSaved={(message) => announce(message ?? "Colours added.")}
      >
        <input type="hidden" name="productId" value={productId} />
        <OptionPicker
          name="colorId"
          legend="Colours to add"
          items={items}
          searchLabel="Search colours"
          searchPlaceholder="Name or code, e.g. Sand or SND"
          noun={{ one: "colour", other: "colours" }}
          empty={
            <>
              Every colour in your catalogue is already on this product. Close this and choose{" "}
              <strong className="font-medium">New colour</strong> to make another.
            </>
          }
        />
        <DialogNote>
          New colours go after the ones already here, and you can move them afterwards. Nothing is on sale until you
          create their variants.
        </DialogNote>
      </FormDialog>

      <FormDialog
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : null)}
        title="New colour"
        description="Colours are shared across the catalogue, so use the name customers will read."
        action={createProductColor}
        submitLabel="Create colour"
        pendingLabel="Creating…"
        onSaved={(message) => announce(message ?? "Colour created.")}
      >
        <input type="hidden" name="productId" value={productId} />
        <NewColorFields registry={registry} />
        <DialogNote>
          The code can’t be changed later: it is printed in the SKU of every variant made with this colour, on labels and
          packing lists. Codes already in use include{" "}
          {joinWords(registry.slice(0, 5).map((color) => color.code))}.
        </DialogNote>
      </FormDialog>
    </AdminSection>
  );
}

function colorMeta(color: ProductColorView, variantsOnColor: number, active: number) {
  const parts = [
    color.code,
    color.hex,
    variantsOnColor === 0 ? "no variants yet" : variantCount(variantsOnColor),
    color.photos === 0
      ? "no photos"
      : `${formatNumber(color.photos)} ${color.photos === 1 ? "photo" : "photos"}`,
  ];
  if (variantsOnColor > 0 && active === 0) parts.push("switched off");
  return <span className="tabular-nums">{parts.join(", ")}</span>;
}

/* ── Creating a colour ──────────────────────────────────────────────────── */

const DEFAULT_HEX = "#C9B592";

function NewColorFields({ registry }: { registry: readonly RegistryColor[] }) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState(DEFAULT_HEX);
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  const taken = registry.map((color) => color.code);
  const suggestion = suggestColorCode(name, taken);
  const shownCode = codeTouched ? code : (suggestion ?? "");

  return (
    <div className="space-y-5">
      <TextField
        name="name"
        label="Name"
        hint="What customers read, e.g. Sand or Indigo Rinse."
        maxLength={COLOR_NAME_MAX}
        autoComplete="off"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <HexField hex={hex} onChange={setHex} />

      <TextField
        name="code"
        label="SKU code"
        hint={`${COLOR_CODE_LENGTH} letters, used in every SKU for this colour. Suggested from the name — change it if you prefer.`}
        maxLength={COLOR_CODE_LENGTH}
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

const HEX_HINT = "The swatch customers see in the colour filter, e.g. #C9B592.";

/** A colour picker beside its hex value; both write the one field the form sends. */
function HexField({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  const ids = useFieldIds("hex", undefined, HEX_HINT);
  const valid = /^#[0-9a-f]{6}$/i.test(hex.trim());

  return (
    <FieldShell {...ids} label="Colour" hint={HEX_HINT}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label="Pick the colour"
          value={valid ? hex.trim() : DEFAULT_HEX}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-10 shrink-0 cursor-pointer border border-border-strong bg-background p-1"
        />
        <Input
          name="hex"
          value={hex}
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          className="h-10 max-w-40 px-3 text-body-sm uppercase tabular-nums"
          onChange={(event) => onChange(event.target.value)}
          {...ids.controlProps}
        />
      </div>
    </FieldShell>
  );
}
