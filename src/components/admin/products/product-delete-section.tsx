import { deleteProductAction } from "@/app/admin/products/actions";
import { DeleteRecordDialog } from "@/components/admin/collections/delete-record-dialog";
import { AdminSection } from "@/components/admin/ui";
import type { ProductStatus } from "@/generated/prisma/enums";
import { productStorefrontPath } from "@/lib/admin/slug";

import { DELETE_EXPLANATION } from "./product-copy";

/*
 * "Delete this product": the last section, and the only one that can't be undone.
 *
 * Only a draft nobody has ever ordered can be deleted. Anything a customer has
 * bought is kept for ever — the order lines name it — so the button is replaced
 * by a plain sentence saying to archive it instead. The server refuses both cases
 * again, so nothing here is load-bearing.
 */

export interface ProductDeleteSectionProps {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  /** Order lines naming this product. Above zero it can never be deleted. */
  orderItemCount: number;
  variantCount: number;
  imageCount: number;
}

export function ProductDeleteSection({
  id,
  name,
  slug,
  status,
  orderItemCount,
  variantCount,
  imageCount,
}: ProductDeleteSectionProps) {
  const ordered = orderItemCount > 0;
  const deletable = status === "DRAFT" && !ordered;

  return (
    <AdminSection title="Delete this product">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-xl text-body-sm text-muted-foreground">
          {ordered
            ? `“${name}” has been ordered ${orderItemCount === 1 ? "once" : `${orderItemCount} times`}, so it is kept for those orders. Archive it instead — that takes it out of the shop and leaves past orders making sense.`
            : status === "DRAFT"
              ? DELETE_EXPLANATION
              : `Only a draft can be deleted. Move “${name}” to draft first, or archive it — archiving takes it out of the shop and keeps it for past orders.`}
        </p>

        {deletable ? (
          <DeleteRecordDialog
            id={id}
            triggerLabel="Delete product"
            title={`Delete the draft “${name}”?`}
            confirmLabel="Delete product"
            action={deleteProductAction}
          >
            <p>{DELETE_EXPLANATION}</p>
            <p>
              {variantCount > 0
                ? `Its ${variantCount === 1 ? "one variant" : `${variantCount} variants`} and their stock go with it. `
                : ""}
              {imageCount > 0
                ? `Its ${imageCount === 1 ? "photo stays" : "photos stay"} in the library, ready for another piece. `
                : ""}
              The address <span className="font-mono break-all">{productStorefrontPath(slug)}</span> becomes free
              again.
            </p>
            <p>This can’t be undone.</p>
          </DeleteRecordDialog>
        ) : null}
      </div>
    </AdminSection>
  );
}
