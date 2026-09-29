import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Notice } from "@/components/admin/collections/notice";
import { ProductPreviewBar } from "@/components/admin/products/product-preview-bar";
import { ProductPreviewPurchase } from "@/components/admin/products/product-preview-purchase";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { DeliveryNotes } from "@/components/product/delivery-notes";
import { productBadgeLabels } from "@/components/product/product-badge";
import { ProductDetails } from "@/components/product/product-details";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductReviews } from "@/components/product/product-reviews";
import { Container } from "@/components/ui/container";
import { Price } from "@/components/ui/price";
import { findSizeGuide } from "@/config/size-guides";
import { siteConfig } from "@/config/site";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import { adminMetadata } from "@/lib/admin/metadata";
import { productPath, productPreviewPath, PRODUCTS_PATH } from "@/lib/admin/product-schema";
import { getProductName, getProductPreview } from "@/lib/admin/products";
import { toMediaAsset } from "@/lib/catalog/mappers";
import { buildPurchaseOptions } from "@/lib/catalog/purchase";

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,191}$/;

export async function generateMetadata(props: PageProps<"/admin/products/[id]/preview">): Promise<Metadata> {
  // Never look anything up for someone who isn't an admin.
  if (!(await getAdminUser())) return adminMetadata("Preview");
  const { id } = await props.params;
  const name = ID_PATTERN.test(id) ? await getProductName(id) : null;
  return adminMetadata(name ? `Preview: ${name}` : "Product not found");
}

/**
 * /admin/products/[id]/preview: the piece as a customer would see it, drafts
 * included, without publishing anything.
 *
 * The product is read straight from the database and mapped with the shop's own
 * mapper (lib/catalog/mappers), not from the cached catalogue snapshot the shop
 * reads — so a draft never has to be published to be seen, and nothing about it
 * is written into a cache customers share. The page itself is an admin page:
 * signed-in admins only, noindex, and never prerendered.
 *
 * The shop's own gallery, details and reviews sections render here unchanged. The
 * colour-and-size panel is a faithful copy rather than the real ProductPurchase,
 * which reads the bag and wish list from storefront providers — a preview must
 * never be able to put something in a customer's bag. Related products are left
 * out: they come from the cached catalogue, which by definition doesn't know
 * about a draft.
 */
export default async function ProductPreviewPage(props: PageProps<"/admin/products/[id]/preview">) {
  const { id } = await props.params;
  await requireAdminPage(productPreviewPath(id));
  if (!ID_PATTERN.test(id)) notFound();

  const preview = await getProductPreview(id);
  if (!preview) notFound();

  const { product, status, strayImageColors } = preview;
  const purchase = buildPurchaseOptions(product, siteConfig.commerce.maxQuantityPerLine);
  const sizeGuide = findSizeGuide(product.category.slug, purchase.sizeSystem);
  const images = [...product.images].sort((a, b) => a.position - b.position).map(toMediaAsset);
  const badge = product.badge ? productBadgeLabels[product.badge] : null;
  const hasPrimary = product.images.some((image) => image.role === "primary");

  return (
    <>
      <ProductPreviewBar id={product.id} name={product.name} slug={product.slug} status={status} />

      <div className="mt-6 space-y-4">
        {images.length === 0 ? (
          <Notice tone="critical" title="No photos yet">
            <p>
              The shop leaves out a piece with no photographs completely — it appears in no listing and its page
              can’t be reached.{" "}
              <Link href={`${productPath(id)}#photos`} className="link-underline-static pb-0.5">
                Add a photo
              </Link>
              .
            </p>
          </Notice>
        ) : !hasPrimary ? (
          <Notice tone="critical" title="No main photo">
            <p>
              There are photos, but none is set as the main image, so the piece is left out of every listing — the
              shop has nothing to put on its card.{" "}
              <Link href={`${productPath(id)}#photos`} className="link-underline-static pb-0.5">
                Set a main photo
              </Link>
              .
            </p>
          </Notice>
        ) : null}

        {purchase.variants.length === 0 ? (
          <Notice tone="warning" title="Nothing can be bought yet">
            <p>
              This piece has no switched-on variant, so the buttons below would do nothing.{" "}
              <Link href={`${productPath(id)}#variants`} className="link-underline-static pb-0.5">
                Add colours, sizes and variants
              </Link>
              .
            </p>
          </Notice>
        ) : null}

        {strayImageColors.length > 0 ? (
          <Notice tone="warning" title="Some photos point at a colour this piece no longer offers">
            <p>
              {strayImageColors.length === 1 ? "One photo is" : `${strayImageColors.length} photos are`} set to a
              colour that has been taken off this piece, so {strayImageColors.length === 1 ? "it is" : "they are"}{" "}
              never shown.{" "}
              <Link href={`${productPath(id)}#photos`} className="link-underline-static pb-0.5">
                Review the photos
              </Link>
              .
            </p>
          </Notice>
        ) : null}
      </div>

      {/* The preview canvas: edge to edge inside the admin frame, so the shop's own layout is honest. */}
      <div className="mt-6 -mx-4 border-y bg-background md:-mx-8 md:border xl:-mx-10">
        <Container className="pt-6 md:pt-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: product.category.name, href: `/shop/${product.category.slug}` },
              { label: product.name },
            ]}
          />
        </Container>

        <div className="mx-auto max-w-(--container-max) pt-6 md:grid md:grid-cols-12 md:gap-x-8 md:px-(--gutter) md:pt-8 xl:gap-x-12">
          {images.length > 0 ? (
            <ProductGallery images={images} productName={product.name} className="md:col-span-6 lg:col-span-7" />
          ) : (
            <div className="px-(--gutter) md:col-span-6 md:px-0 lg:col-span-7">
              <div className="flex aspect-4/5 items-center justify-center border border-dashed text-body-sm text-muted-foreground">
                No photographs yet
              </div>
            </div>
          )}

          <div className="px-(--gutter) pt-8 md:col-span-6 md:px-0 md:pt-0 lg:col-span-5 xl:col-span-4 xl:col-start-9">
            <p className="text-eyebrow text-muted-foreground">
              {product.category.name}
              {badge ? <span className="text-accent-brand"> · {badge}</span> : null}
            </p>
            <h2 className="mt-4 font-display text-display-sm">{product.name}</h2>
            <Price amount={product.price} compareAt={product.compareAtPrice} className="mt-4 text-body" />
            <p className="mt-6 max-w-md text-body text-muted-foreground">
              {product.summary || "No summary written yet."}
            </p>

            <ProductPreviewPurchase options={purchase} hasSizeGuide={sizeGuide !== null} />

            <div className="mt-8 border-t pt-6">
              <DeliveryNotes />
            </div>
          </div>
        </div>

        <ProductDetails product={product} />
        <ProductReviews productName={product.name} />
        <div className="pb-20 md:pb-28" />
      </div>

      <div className="mt-6 space-y-2 text-caption text-muted-foreground">
        <p>
          Two parts of the real page are left out here: the “Complete the look” and “You may also like” shelves,
          which are built from the shop’s cached catalogue and so can’t include a piece that isn’t published yet.
        </p>
        <p>
          <Link href={PRODUCTS_PATH} className="link-underline-static pb-0.5">
            Back to all products
          </Link>
        </p>
      </div>
    </>
  );
}
