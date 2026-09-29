import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Notice } from "@/components/admin/collections/notice";
import { ProductBasicsForm } from "@/components/admin/products/product-basics-form";
import { ProductDeleteSection } from "@/components/admin/products/product-delete-section";
import { ProductImagesSection } from "@/components/admin/products/product-images-section";
import { ProductOrganisationForm } from "@/components/admin/products/product-organisation-form";
import { ProductPricingForm } from "@/components/admin/products/product-pricing-form";
import { ProductSeoForm } from "@/components/admin/products/product-seo-form";
import { ProductStatusSection } from "@/components/admin/products/product-status-section";
import { ProductVariantsSection } from "@/components/admin/products/product-variants-section";
import { ProductImagesSkeleton } from "@/components/admin/products/images/product-images-skeleton";
import { AdminPageHeader, StatusBadge, TableSkeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import { formatAdminDateTime } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import {
  PRODUCTS_PATH,
  canPublish,
  productPath,
  productPreviewPath,
  publishChecklist,
} from "@/lib/admin/product-schema";
import { getAdminProduct, getProductFormOptions, getProductName } from "@/lib/admin/products";
import { productStorefrontPath } from "@/lib/admin/slug";
import { productStatusDisplay } from "@/lib/admin/status";

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,191}$/;

const ON_THIS_PAGE = [
  { id: "status", label: "Status" },
  { id: "basics", label: "Basics" },
  { id: "pricing", label: "Pricing" },
  { id: "organisation", label: "Organisation" },
  { id: "photos", label: "Photos" },
  { id: "variants", label: "Variants and stock" },
  { id: "seo", label: "Search engines" },
];

const ANCHOR = "scroll-mt-20 lg:scroll-mt-8";

export async function generateMetadata(props: PageProps<"/admin/products/[id]">): Promise<Metadata> {
  // Never look anything up for someone who isn't an admin.
  if (!(await getAdminUser())) return adminMetadata("Product");
  const { id } = await props.params;
  const name = ID_PATTERN.test(id) ? await getProductName(id) : null;
  return adminMetadata(name ? `${name} — Products` : "Product not found");
}

/**
 * /admin/products/[id]: everything about one piece, in sections the owner can
 * work through and save one at a time. Photos and variants save each change as it
 * is made and are streamed in behind their own placeholders.
 *
 * Every saving form carries the moment this page was built, so a save made from a
 * page someone else has already changed is refused rather than quietly
 * overwriting their work. ?created=1 confirms a piece created a moment ago.
 */
export default async function ProductEditorPage(props: PageProps<"/admin/products/[id]">) {
  const { id } = await props.params;
  await requireAdminPage(productPath(id));
  if (!ID_PATTERN.test(id)) notFound();

  const [product, options, searchParams] = await Promise.all([
    getAdminProduct(id),
    getProductFormOptions(),
    props.searchParams,
  ]);
  if (!product) notFound();

  const display = productStatusDisplay(product.status);
  const checklist = publishChecklist(product.facts);
  const ready = canPublish(product.facts);
  const created = searchParams.created === "1";
  const updatedAt = product.updatedAt.toISOString();
  const live = product.status === "ACTIVE";

  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title={product.name}
        breadcrumbs={[{ label: "Products", href: PRODUCTS_PATH }, { label: product.name }]}
        meta={
          <>
            <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
            <span className="font-mono text-caption text-muted-foreground">{product.code}</span>
            <span className="text-muted-foreground">{product.category.name}</span>
          </>
        }
        description={
          <>
            {display.description}{" "}
            <span className="whitespace-nowrap">Last changed {formatAdminDateTime(product.updatedAt)}.</span>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={productPreviewPath(product.id)}>Preview</Link>
            </Button>
            {live ? (
              <Button asChild variant="outline" size="sm">
                <a href={productStorefrontPath(product.slug)} target="_blank" rel="noopener">
                  View in shop<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      {created ? (
        <Notice tone="success" role="status" title="Draft created." className="mt-6">
          <p>
            It’s hidden from the shop for now. Write its words, add photos, then its colours, sizes and stock — the
            checklist under “Status” shows what is still needed before it can go live.
          </p>
        </Notice>
      ) : null}

      <nav aria-label="On this page" className="mt-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
          {ON_THIS_PAGE.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="inline-flex min-h-10 items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="link-underline pb-0.5">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-2 space-y-6">
        <ProductStatusSection
          id={product.id}
          name={product.name}
          status={product.status}
          checklist={checklist}
          ready={ready}
        />

        <ProductBasicsForm
          id={product.id}
          updatedAt={updatedAt}
          values={{
            name: product.name,
            slug: product.slug,
            code: product.code,
            summary: product.summary,
            description: product.description,
            details: product.details,
            material: product.material,
            care: product.care,
            fit: product.fit,
            modelNote: product.modelNote,
          }}
          variantCount={product.facts.variantCount}
          categoryCode={product.category.code}
          liveInShop={live}
        />

        <ProductPricingForm
          id={product.id}
          updatedAt={updatedAt}
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          overriddenVariantCount={product.variantsWithOwnPrice}
        />

        <ProductOrganisationForm
          id={product.id}
          updatedAt={updatedAt}
          values={{
            categoryId: product.categoryId,
            collectionIds: product.collectionIds,
            tags: product.tags,
            badge: product.badge,
            isFeatured: product.isFeatured,
            bestsellerRank: product.bestsellerRank,
          }}
          categories={options.categories}
          collections={options.collections}
        />

        <div id="photos" className={ANCHOR}>
          <Suspense fallback={<ProductImagesSkeleton />}>
            <ProductImagesSection productId={product.id} />
          </Suspense>
        </div>

        <div id="variants" className={ANCHOR}>
          <Suspense fallback={<TableSkeleton rows={4} columns={5} header={false} toolbar={false} />}>
            <ProductVariantsSection productId={product.id} />
          </Suspense>
        </div>

        <ProductSeoForm
          id={product.id}
          updatedAt={updatedAt}
          seoTitle={product.seoTitle}
          seoDescription={product.seoDescription}
          productName={product.name}
          categoryName={product.category.name}
          summary={product.summary}
          slug={product.slug}
          siteUrl={siteConfig.url}
        />

        <ProductDeleteSection
          id={product.id}
          name={product.name}
          slug={product.slug}
          status={product.status}
          orderItemCount={product.orderItemCount}
          variantCount={product.facts.variantCount}
          imageCount={product.facts.imageCount}
        />
      </div>
    </div>
  );
}
