import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionGallery } from "@/components/collection/collection-gallery";
import { CollectionHero } from "@/components/collection/collection-hero";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ensurePageInRange } from "@/components/listing/data";
import { ProductListing } from "@/components/listing/product-listing";
import { Container } from "@/components/ui/container";
import { shopConfig } from "@/config/shop";
import {
  EMPTY_LISTING_PARAMS,
  hasRefinements,
  parseListingParams,
  toProductQuery,
  type ListingParams,
} from "@/lib/catalog/listing-params";
import { defaultSort } from "@/lib/catalog/query";
import { getCollectionBySlug, getCollections, listProducts } from "@/lib/catalog/repository";
import { pageMetadata } from "@/lib/seo/metadata";

/** Collections are edited, not filtered: only the order and page carry over from the URL. */
function sortOnly(params: ListingParams): ListingParams {
  return { ...EMPTY_LISTING_PARAMS, sort: params.sort, page: params.page };
}

export async function generateStaticParams() {
  const collections = await getCollections();
  return collections.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return {};

  return pageMetadata({
    title: collection.season ? `${collection.name} — ${collection.season}` : collection.name,
    description: collection.summary,
    path: `/collections/${slug}`,
    image: collection.heroImage,
    noindex: hasRefinements(sortOnly(parseListingParams(await searchParams))),
  });
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const basePath = `/collections/${slug}`;
  const listing = sortOnly(parseListingParams(await searchParams));
  const query = toProductQuery(listing, { collection: slug }, shopConfig.pageSize);
  const result = await listProducts(query);
  ensurePageInRange(basePath, listing, result);

  const gallery = collection.images.filter((image) => image.src !== collection.heroImage?.src);

  return (
    <>
      <Container className="pt-6 md:pt-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Collections", href: "/collections" },
            { label: collection.name },
          ]}
        />
      </Container>

      <CollectionHero collection={collection} productCount={result.total} headingId="collection-heading" />
      <CollectionGallery images={gallery} label={`${collection.name} campaign`} />

      <section aria-labelledby="collection-pieces-heading" className="pt-20 md:pt-28 xl:pt-36">
        <Container className="pb-24 md:pb-32">
          <h2 id="collection-pieces-heading" className="mb-8 font-display text-display-sm md:mb-10">
            The pieces
          </h2>
          <ProductListing
            basePath={basePath}
            params={listing}
            defaultSort={defaultSort(query)}
            result={result}
            facets={null}
            resultsHeading={null}
          />
        </Container>
      </section>
    </>
  );
}
