import Link from "next/link";

import { Notice } from "@/components/admin/collections/notice";
import { NewProductForm } from "@/components/admin/products/new-product-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { CATEGORIES_PATH } from "@/lib/admin/categories";
import { adminMetadata } from "@/lib/admin/metadata";
import { NEW_PRODUCT_PATH, PRODUCTS_PATH } from "@/lib/admin/product-schema";
import { getProductFormOptions, listProductCodes, listProductSlugs } from "@/lib/admin/products";

export const metadata = adminMetadata("New product");

/**
 * /admin/products/new: the few facts a piece can't exist without — a name, a
 * category, a price and its three-letter SKU code. It is created as a draft,
 * hidden from the shop, and the editor opens next for everything else.
 */
export default async function NewProductPage() {
  await requireAdminPage(NEW_PRODUCT_PATH);

  const [options, takenCodes, takenSlugs] = await Promise.all([
    getProductFormOptions(),
    listProductCodes(),
    listProductSlugs(),
  ]);

  return (
    <div className="max-w-3xl">
      <AdminPageHeader
        title="New product"
        breadcrumbs={[{ label: "Products", href: PRODUCTS_PATH }, { label: "New product" }]}
        description="Start with the essentials. Nothing is shown to customers yet — the piece is created as a draft, and the next page is where its words, photos, colours, sizes and stock go."
      />

      {options.categories.length === 0 ? (
        <Notice tone="warning" title="There are no categories yet" className="mt-6">
          <p>
            Every piece belongs to exactly one category, and the category’s own three-letter code is part of each
            SKU. Create one first, then come back.
          </p>
          <p className="mt-3">
            <Button asChild size="sm">
              <Link href={`${CATEGORIES_PATH}/new`}>New category</Link>
            </Button>
          </p>
        </Notice>
      ) : (
        <div className="mt-6">
          <NewProductForm categories={options.categories} takenCodes={takenCodes} takenSlugs={takenSlugs} />
        </div>
      )}
    </div>
  );
}
