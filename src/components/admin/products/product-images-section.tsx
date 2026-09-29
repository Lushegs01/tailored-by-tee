import { AdminEmptyState, AdminSection } from "@/components/admin/ui";
import { getAdminUser } from "@/lib/admin/auth";
import { isCloudinaryConfigured } from "@/lib/admin/cloudinary";
import { getDb } from "@/lib/db";

import { ProductImagesManager, type ManagedImage } from "./images/product-images-manager";

export interface ProductImagesSectionProps {
  productId: string;
}

/**
 * The "Photos" section of the product editor (async server component):
 *
 *   <ProductImagesSection productId={product.id} />
 *
 * Lists the product's photos in the order customers see them, explains what each
 * role does on the storefront, and lets the owner add (library, upload, web
 * address), edit role / colour / description, reorder and remove photos. Every
 * change goes through the actions in app/admin/products/[id]/image-actions.ts.
 * Render it outside any <form>: it contains forms of its own.
 */
export async function ProductImagesSection({ productId }: ProductImagesSectionProps) {
  // The page has already called requireAdminPage; never read data for anyone else.
  const admin = await getAdminUser();
  if (!admin) return null;

  const product = await getDb().product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      status: true,
      colors: {
        orderBy: { position: "asc" },
        select: { color: { select: { id: true, name: true, hex: true } } },
      },
      images: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          role: true,
          colorId: true,
          position: true,
          color: { select: { name: true } },
          media: {
            select: {
              id: true,
              url: true,
              width: true,
              height: true,
              alt: true,
              color: true,
              _count: {
                select: {
                  productImages: true,
                  categories: true,
                  collectionHeroes: true,
                  collectionImages: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!product) {
    return (
      <AdminSection title="Photos">
        <AdminEmptyState
          title="This product no longer exists"
          body="It may have been deleted. Go back to the product list."
        />
      </AdminSection>
    );
  }

  const images: ManagedImage[] = product.images.map((image) => {
    const counts = image.media._count;
    const uses = counts.productImages + counts.categories + counts.collectionHeroes + counts.collectionImages;
    return {
      id: image.id,
      role: image.role,
      colorId: image.colorId,
      colorName: image.color?.name ?? null,
      position: image.position,
      media: {
        id: image.media.id,
        url: image.media.url,
        width: image.media.width,
        height: image.media.height,
        alt: image.media.alt,
        color: image.media.color,
        otherUses: Math.max(0, uses - 1),
      },
    };
  });

  return (
    <ProductImagesManager
      productId={product.id}
      productName={product.name}
      productStatus={product.status}
      colors={product.colors.map((link) => link.color)}
      images={images}
      uploadsEnabled={isCloudinaryConfigured()}
    />
  );
}
