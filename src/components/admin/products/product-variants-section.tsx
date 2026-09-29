import { AdminEmptyState, AdminSection } from "@/components/admin/ui";
import { getAdminUser } from "@/lib/admin/auth";
import { getProductVariantsData } from "@/lib/admin/variants";

import { ProductVariantsManager } from "./variants/product-variants-manager";

export interface ProductVariantsSectionProps {
  productId: string;
}

/**
 * The "Colours", "Sizes" and "Variants and stock" panels of the product editor
 * (async server component):
 *
 *   <ProductVariantsSection productId={product.id} />
 *
 * Shows the product's colourways and sizes in the order customers see them, and
 * the colour × size grid behind them: which variants exist, their SKUs, what is
 * available to sell and what each one costs. Every change goes through the
 * actions in app/admin/products/[id]/variant-actions.ts, except stock, which
 * uses the inventory page's own actions so both places behave identically.
 *
 * Render it outside any <form>: it contains forms and dialogs of its own.
 */
export async function ProductVariantsSection({ productId }: ProductVariantsSectionProps) {
  // The page has already called requireAdminPage; never read data for anyone else.
  const admin = await getAdminUser();
  if (!admin) return null;

  const data = await getProductVariantsData(productId);

  if (!data) {
    return (
      <AdminSection title="Variants and stock">
        <AdminEmptyState
          title="This product no longer exists"
          body="It may have been deleted. Go back to the product list."
        />
      </AdminSection>
    );
  }

  return <ProductVariantsManager data={data} />;
}
