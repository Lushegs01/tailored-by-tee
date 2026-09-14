import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { DeliveryNotes } from "@/components/product/delivery-notes";
import { productBadgeLabels } from "@/components/product/product-badge";
import { ProductDetails } from "@/components/product/product-details";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductPurchase } from "@/components/product/product-purchase";
import { ProductReviews } from "@/components/product/product-reviews";
import { RelatedProducts } from "@/components/product/related-products";
import { JsonLd, productJsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/container";
import { Price } from "@/components/ui/price";
import { findSizeGuide } from "@/config/size-guides";
import { siteConfig } from "@/config/site";
import { toMediaAsset } from "@/lib/catalog/mappers";
import { buildPurchaseOptions } from "@/lib/catalog/purchase";
import { getProductBySlug, getProductSlugs, getRelatedProducts } from "@/lib/catalog/repository";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateStaticParams() {
  return (await getProductSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const primary = product.images.find((image) => image.role === "primary") ?? product.images[0];
  return pageMetadata({
    title: product.seo.title ?? `${product.name} — ${product.category.name}`,
    description: product.seo.description ?? product.summary,
    path: `/product/${product.slug}`,
    image: primary ? toMediaAsset(primary) : null,
  });
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(slug);
  const purchase = buildPurchaseOptions(product, siteConfig.commerce.maxQuantityPerLine);
  const sizeGuide = findSizeGuide(product.category.slug, purchase.sizeSystem);
  const images = [...product.images].sort((a, b) => a.position - b.position).map(toMediaAsset);
  const badge = product.badge ? productBadgeLabels[product.badge] : null;

  return (
    <>
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
        <ProductGallery images={images} productName={product.name} className="md:col-span-6 lg:col-span-7" />

        <div className="px-(--gutter) pt-8 md:col-span-6 md:px-0 md:pt-0 lg:col-span-5 xl:col-span-4 xl:col-start-9">
          <div className="md:sticky md:top-[calc(var(--header-height)+2rem)]">
            <p className="text-eyebrow text-muted-foreground">
              <Link href={`/shop/${product.category.slug}`} className="link-underline pb-0.5 hover:text-foreground">
                {product.category.name}
              </Link>
              {badge ? <span className="text-accent-brand"> · {badge}</span> : null}
            </p>
            <h1 className="mt-4 font-display text-display-sm">{product.name}</h1>
            <Price amount={product.price} compareAt={product.compareAtPrice} className="mt-4 text-body" />
            <p className="mt-6 max-w-md text-body text-muted-foreground">{product.summary}</p>

            <ProductPurchase options={purchase} sizeGuide={sizeGuide} delivery={<DeliveryNotes />} />
          </div>
        </div>
      </div>

      <ProductDetails product={product} />
      <ProductReviews productName={product.name} />
      <RelatedProducts
        id="complete-the-look-heading"
        eyebrow="Worn with"
        title="Complete *the look.*"
        products={related.completeTheLook}
      />
      <RelatedProducts
        id="similar-heading"
        eyebrow={product.category.name}
        title="You may also like"
        products={related.similar}
      />
      <div className="pb-24 md:pb-32" />

      <JsonLd data={productJsonLd(product)} />
    </>
  );
}
