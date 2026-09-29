"use client";

import { useMemo, useState, type ReactNode } from "react";

import { AdminEmptyState, AdminSection } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

import { CreateVariantsDialog } from "./create-variants-dialog";
import { OrphanVariantsTable, VariantMatrix } from "./variant-matrix";
import {
  buildVariantMatrix,
  comboKey,
  saleNote,
  summariseVariants,
  variantCount,
  type MatrixCell,
  type ProductVariantsData,
} from "./variant-rules";

/*
 * "Variants and stock": every colour and size combination this product is made
 * in. A variant is what a customer actually buys — it carries the SKU, the stock
 * and, rarely, its own price — so nothing is on sale until its variant exists
 * and has stock.
 */

export interface VariantsPanelProps {
  data: ProductVariantsData;
  /** Announces a saved change on the section's confirmation line. */
  announce: (message: string) => void;
}

export function VariantsPanel({ data, announce }: VariantsPanelProps) {
  const [creating, setCreating] = useState<{ preselect?: string[] } | null>(null);
  const { product, colors, sizes, variants } = data;

  const matrix = useMemo(
    () => buildVariantMatrix({ product, colors, sizes, variants }),
    [product, colors, sizes, variants],
  );
  const summary = useMemo(() => summariseVariants(variants), [variants]);

  const combinations = colors.length * sizes.length;
  const buildable = matrix.missing.filter((cell) => cell.sku !== null).length;
  const note = saleNote(product.status);

  function createOne(cell: MatrixCell) {
    setCreating({ preselect: [comboKey(cell.color.id, cell.size.id)] });
  }

  return (
    <AdminSection
      title="Variants and stock"
      description="Every colour and size this piece is made in. A variant carries the SKU customers’ orders and your packing lists show, and its own stock."
      actions={
        buildable > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating({})}>
            Create missing variants
          </Button>
        ) : null
      }
      bodyClassName="space-y-5"
    >
      {colors.length === 0 || sizes.length === 0 ? (
        <AdminEmptyState
          title="Nothing to make variants from yet"
          body={
            colors.length === 0 && sizes.length === 0
              ? "Add at least one colour and one size above. A variant is one colour in one size — that is what a customer buys."
              : colors.length === 0
                ? "Add at least one colour above. A variant is one colour in one size."
                : "Add at least one size above. A variant is one colour in one size."
          }
        />
      ) : (
        <>
          <Summary
            total={summary.total}
            combinations={combinations}
            available={summary.available}
            lowStock={summary.lowStock}
            soldOut={summary.soldOut}
            inactive={summary.inactive}
          />

          {note ? <Notice tone="info">{note}</Notice> : null}

          {matrix.skuProblems.length > 0 ? (
            <Notice tone="critical" title="Some SKUs can’t be made">
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {matrix.skuProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <p className="mt-2">
                Codes use capital letters and numbers only. Fix them where the colour, size, product or category is
                edited, then create the variants.
              </p>
            </Notice>
          ) : null}

          {matrix.missing.length > 0 ? (
            <Notice tone="attention">
              {matrix.missing.length === combinations
                ? `None of the ${formatNumber(combinations)} colour and size combinations has a variant yet, so nothing can be bought.`
                : `${formatNumber(matrix.missing.length)} of ${formatNumber(combinations)} combinations ${
                    matrix.missing.length === 1 ? "has" : "have"
                  } no variant yet, so ${matrix.missing.length === 1 ? "it" : "they"} can’t be bought.`}{" "}
              {buildable > 0 ? "Use “Create missing variants” above, or “Create” on a row." : ""}
            </Notice>
          ) : null}

          {summary.total > 0 && summary.available === 0 ? (
            <Notice tone="attention">
              Nothing is available to sell: every variant is sold out or switched off. Add stock with “Adjust” on a row.
            </Notice>
          ) : null}

          <VariantMatrix
            productId={product.id}
            productName={product.name}
            productPrice={product.price}
            groups={matrix.groups}
            announce={announce}
            onCreateOne={createOne}
          />
        </>
      )}

      {matrix.orphans.length > 0 ? (
        <div className="space-y-3">
          <Notice tone="attention" title="Kept from colours or sizes you no longer offer">
            {matrix.orphans.length === 1
              ? "This variant belongs to a colour or size that has been taken off the product, so it isn’t in the grid above."
              : `These ${variantCount(matrix.orphans.length)} belong to a colour or size that has been taken off the product, so they aren’t in the grid above.`}{" "}
            {matrix.orphans.length === 1 ? "It isn’t" : "They aren’t"} offered on the product page, and orders that
            included {matrix.orphans.length === 1 ? "it" : "them"} still show correctly. Switch{" "}
            {matrix.orphans.length === 1 ? "it" : "them"} off to be sure, or delete{" "}
            {matrix.orphans.length === 1 ? "it" : "them"} once {matrix.orphans.length === 1 ? "it has" : "they have"} no
            stock.
          </Notice>
          <OrphanVariantsTable
            productId={product.id}
            productName={product.name}
            productPrice={product.price}
            variants={matrix.orphans}
            announce={announce}
          />
        </div>
      ) : null}

      <CreateVariantsDialog
        open={creating !== null}
        onOpenChange={(open) => setCreating(open ? (creating ?? {}) : null)}
        productId={product.id}
        missing={matrix.missing}
        preselect={creating?.preselect}
        announce={announce}
      />
    </AdminSection>
  );
}

/* ── The figures above the grid ─────────────────────────────────────────── */

function Summary({
  total,
  combinations,
  available,
  lowStock,
  soldOut,
  inactive,
}: {
  total: number;
  combinations: number;
  available: number;
  lowStock: number;
  soldOut: number;
  inactive: number;
}) {
  const figures: { label: string; value: number; hint?: string }[] = [
    {
      label: "Variants",
      value: total,
      hint: `of ${formatNumber(combinations)} combinations${inactive > 0 ? `, ${formatNumber(inactive)} switched off` : ""}`,
    },
    { label: "Available to sell", value: available, hint: "pieces, across switched-on variants" },
    { label: "Low stock", value: lowStock, hint: variantCount(lowStock) },
    { label: "Sold out", value: soldOut, hint: variantCount(soldOut) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b pb-5 sm:grid-cols-4">
      {figures.map((figure) => (
        <div key={figure.label} className="min-w-0">
          <dt className="text-eyebrow text-muted-foreground">{figure.label}</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{formatNumber(figure.value)}</dd>
          {figure.hint ? <dd className="mt-0.5 text-caption text-muted-foreground">{figure.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/* ── Notices ────────────────────────────────────────────────────────────── */

const NOTICE_TONES = {
  info: "border-border-strong text-muted-foreground",
  attention: "border-accent-brand/50 text-foreground",
  critical: "border-danger/50 text-foreground",
} as const;

function Notice({
  tone,
  title,
  children,
}: {
  tone: keyof typeof NOTICE_TONES;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("border-l-2 pl-3 text-body-sm", NOTICE_TONES[tone])}>
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
