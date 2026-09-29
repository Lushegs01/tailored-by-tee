"use client";

import { InventoryFeedbackProvider, useInventoryFeedback } from "@/components/admin/inventory/inventory-feedback";

import { ColorsPanel } from "./colors-panel";
import { SizesPanel } from "./sizes-panel";
import { VariantsPanel } from "./variants-panel";
import type { ProductVariantsData } from "./variant-rules";

/*
 * The product editor's colours, sizes and variants, in three panels.
 *
 * Every change is a server action that re-reads this data, so the panels always
 * show what the database says rather than what the browser guessed. A saved
 * change closes its dialog and is confirmed on the one line at the bottom of the
 * screen (the same one the stock page uses), which screen readers announce; a
 * refused change stays in its dialog with the reason beside the field.
 */

export function ProductVariantsManager({ data }: { data: ProductVariantsData }) {
  return (
    <InventoryFeedbackProvider>
      <VariantPanels data={data} />
    </InventoryFeedbackProvider>
  );
}

function VariantPanels({ data }: { data: ProductVariantsData }) {
  const announce = useInventoryFeedback();
  const { product, colors, sizes, variants, registry } = data;

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <ColorsPanel
          productId={product.id}
          colors={colors}
          variants={variants}
          registry={registry.colors}
          announce={announce}
        />
        <SizesPanel
          productId={product.id}
          sizes={sizes}
          variants={variants}
          registry={registry.sizes}
          announce={announce}
        />
      </div>
      <VariantsPanel data={data} announce={announce} />
    </div>
  );
}
