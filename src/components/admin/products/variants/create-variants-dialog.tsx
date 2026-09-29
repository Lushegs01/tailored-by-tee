"use client";

import { useId, useState } from "react";

import { createProductVariants } from "@/app/admin/products/[id]/variant-actions";
import { ColorSwatch } from "@/components/admin/inventory/color-swatch";
import { useAdminFieldError } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatNumber } from "@/lib/admin/format";
import { MAX_STOCK_CHANGE, parseWholeNumber } from "@/lib/admin/stock-state";
import { cn } from "@/lib/utils";

import { DialogNote, FormDialog } from "./form-dialog";
import { COMBO_FIELD, comboKey, openingStockField, variantCount, type MatrixCell } from "./variant-rules";

/*
 * "Create missing variants": one variant for each ticked colour and size, with
 * its SKU and its opening stock. They are created together — if one of them
 * can't be, none is — and each opening figure is recorded as that variant's
 * first stock movement, so its history starts with a reason.
 *
 * The dialog's body is mounted only while it is open, so every time it opens it
 * starts from what is missing now, with nothing left over from last time.
 */

export interface CreateVariantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  /** Colour and size combinations without a variant, colour by colour. */
  missing: readonly MatrixCell[];
  /** Ticked when the dialog opens; everything when left out. */
  preselect?: readonly string[];
  announce: (message: string) => void;
}

export function CreateVariantsDialog({
  open,
  onOpenChange,
  productId,
  missing,
  preselect,
  announce,
}: CreateVariantsDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Create variants"
      description="One variant for each colour and size you tick, with its SKU and opening stock."
      action={createProductVariants}
      submitLabel="Create variants"
      pendingLabel="Creating…"
      onSaved={(message) => announce(message ?? "Variants created.")}
    >
      <input type="hidden" name="productId" value={productId} />
      <CreateVariantsBody missing={missing} preselect={preselect} />
    </FormDialog>
  );
}

function CreateVariantsBody({
  missing,
  preselect,
}: {
  missing: readonly MatrixCell[];
  preselect?: readonly string[];
}) {
  const buildable = missing.filter((cell) => cell.sku !== null);
  const unbuildable = missing.length - buildable.length;

  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(preselect ?? buildable.map((cell) => comboKey(cell.color.id, cell.size.id))),
  );
  const [stock, setStock] = useState<Readonly<Record<string, string>>>({});
  const [bulk, setBulk] = useState("");
  const bulkId = useId();

  const groups = groupByColour(buildable);
  const chosen = buildable.filter((cell) => selected.has(comboKey(cell.color.id, cell.size.id)));
  const opening = chosen.reduce((sum, cell) => {
    const value = parseWholeNumber(stock[comboKey(cell.color.id, cell.size.id)] ?? "");
    return sum + (value ?? 0);
  }, 0);

  function toggle(key: string, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setAll(on: boolean) {
    setSelected(on ? new Set(buildable.map((cell) => comboKey(cell.color.id, cell.size.id))) : new Set());
  }

  function applyBulk() {
    const value = parseWholeNumber(bulk);
    if (value === null || value < 0 || value > MAX_STOCK_CHANGE) return;
    setStock((previous) => {
      const next = { ...previous };
      for (const cell of buildable) {
        const key = comboKey(cell.color.id, cell.size.id);
        if (selected.has(key)) next[key] = String(value);
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {unbuildable > 0 ? (
        <p className="border-l-2 border-danger/60 pl-3 text-body-sm">
          {unbuildable === 1 ? "One combination has" : `${formatNumber(unbuildable)} combinations have`} no SKU, because
          a colour or size code can’t be used in SKUs. Fix the code first; the rest can be created now.
        </p>
      ) : null}

      {buildable.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">Every colour and size on this product already has a variant.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-9 px-3" onClick={() => setAll(true)}>
                Tick all
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-9 px-3" onClick={() => setAll(false)}>
                Untick all
              </Button>
            </div>
            <div className="min-w-0">
              <Label htmlFor={bulkId} className="mb-1.5">
                Opening stock for all ticked
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={bulkId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={bulk}
                  placeholder="0"
                  onChange={(event) => setBulk(event.target.value)}
                  className="h-9 w-24 px-3 text-body-sm tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  disabled={parseWholeNumber(bulk) === null}
                  onClick={applyBulk}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>

          <ComboList
            groups={groups}
            selected={selected}
            stock={stock}
            onToggle={toggle}
            onStockChange={(key, value) => setStock((previous) => ({ ...previous, [key]: value }))}
          />

          <p aria-live="polite" className="text-caption text-muted-foreground tabular-nums">
            {chosen.length === 0
              ? "Nothing ticked yet."
              : `${variantCount(chosen.length)} will be created${
                  opening > 0 ? `, with ${formatNumber(opening)} pieces of opening stock in total` : ", with no stock"
                }.`}
          </p>
        </>
      )}

      <DialogNote>
        Opening stock is what is on your shelf now. It is saved as each variant’s first stock movement, so the history
        explains where the pieces came from. You can change it afterwards with “Adjust”.
      </DialogNote>
    </div>
  );
}

/* ── The list of combinations ───────────────────────────────────────────── */

interface Group {
  colorId: string;
  colorName: string;
  colorHex: string;
  cells: MatrixCell[];
}

function groupByColour(cells: readonly MatrixCell[]): Group[] {
  const groups: Group[] = [];
  for (const cell of cells) {
    let group = groups.find((item) => item.colorId === cell.color.id);
    if (!group) {
      group = { colorId: cell.color.id, colorName: cell.color.name, colorHex: cell.color.hex, cells: [] };
      groups.push(group);
    }
    group.cells.push(cell);
  }
  return groups;
}

function ComboList({
  groups,
  selected,
  stock,
  onToggle,
  onStockChange,
}: {
  groups: readonly Group[];
  selected: ReadonlySet<string>;
  stock: Readonly<Record<string, string>>;
  onToggle: (key: string, on: boolean) => void;
  onStockChange: (key: string, value: string) => void;
}) {
  const comboError = useAdminFieldError(COMBO_FIELD);

  return (
    <div className="min-w-0">
      <div className="max-h-[24rem] overflow-y-auto overscroll-contain border">
        {groups.map((group) => (
          <fieldset key={group.colorId} className="border-b last:border-b-0">
            <legend className="sr-only">{group.colorName}</legend>
            <p
              aria-hidden="true"
              className="flex items-center gap-2 border-b bg-surface/50 px-3 py-2 text-caption font-medium"
            >
              <ColorSwatch hex={group.colorHex} />
              {group.colorName}
            </p>
            <ul className="divide-y">
              {group.cells.map((cell) => {
                const key = comboKey(cell.color.id, cell.size.id);
                return (
                  <ComboRow
                    key={key}
                    colorId={cell.color.id}
                    sizeId={cell.size.id}
                    colorName={group.colorName}
                    sizeLabel={cell.size.label}
                    sku={cell.sku ?? ""}
                    checked={selected.has(key)}
                    stock={stock[key] ?? ""}
                    onToggle={(on) => onToggle(key, on)}
                    onStockChange={(value) => onStockChange(key, value)}
                  />
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
      {comboError ? (
        <p role="alert" className="mt-1.5 text-caption text-danger">
          {comboError}
        </p>
      ) : null}
    </div>
  );
}

function ComboRow({
  colorId,
  sizeId,
  colorName,
  sizeLabel,
  sku,
  checked,
  stock,
  onToggle,
  onStockChange,
}: {
  colorId: string;
  sizeId: string;
  colorName: string;
  sizeLabel: string;
  sku: string;
  checked: boolean;
  stock: string;
  onToggle: (on: boolean) => void;
  onStockChange: (value: string) => void;
}) {
  const field = openingStockField(colorId, sizeId);
  const error = useAdminFieldError(field);
  const stockId = useId();
  const errorId = `${stockId}-error`;

  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2", !checked && "opacity-60")}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name={COMBO_FIELD}
          value={comboKey(colorId, sizeId)}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
          className="size-4 shrink-0 cursor-pointer accent-foreground"
        />
        <span className="min-w-0">
          <span className="block text-body-sm font-medium">{sizeLabel}</span>
          <span className="mt-0.5 block text-caption break-all text-muted-foreground">{sku}</span>
        </span>
      </label>

      <div className="shrink-0">
        <label htmlFor={stockId} className="sr-only">
          Opening stock for {colorName}, {sizeLabel}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={stockId}
            name={field}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={stock}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onStockChange(event.target.value)}
            className="h-9 w-20 px-3 text-body-sm tabular-nums"
          />
          <span aria-hidden="true" className="text-caption text-muted-foreground">
            pieces
          </span>
        </div>
        {error ? (
          <p id={errorId} className="mt-1 text-caption text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
