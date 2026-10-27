import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CategoryNav } from "@/components/listing/category-nav";
import { ensurePageInRange, getCategoryNav } from "@/components/listing/data";
import { ListingHeader } from "@/components/listing/listing-header";
import { ProductListing } from "@/components/listing/product-listing";
import { Container } from "@/components/ui/container";
import { shopConfig } from "@/config/shop";
import { hasRefinements, parseListingParams, toProductQuery } from "@/lib/catalog/listing-params";
import { defaultSort } from "@/lib/catalog/query";
import { getCategoryBySlug, getListingFacets, listProducts } from "@/lib/catalog/repository";
import { VIRTUAL_CATEGORIES, isVirtualCategory } from "@/lib/catalog/virtual-categories";
import type { MediaAsset } from "@/lib/media/types";
import { pageMetadata } from "@/lib/seo/metadata";

interface ListingScope {
  name: string;
  description: string;
  image: MediaAsset | null;
}

/** A real category, or one of the derived listings (new arrivals, sale). */
async function resolveScope(slug: string): Promise<ListingScope | null> {
  if (isVirtualCategory(slug)) {
    const { name, description } = VIRTUAL_CATEGORIES[slug];
    return { name, description, image: null };
  }
  const category = await getCategoryBySlug(slug);
  return category ? { name: category.name, description: category.description, image: category.image } : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const scope = await resolveScope(slug);
  if (!scope) return {};

  return pageMetadata({
    title: scope.name,
    description: scope.description,
    path: `/shop/${slug}`,
    image: scope.image,
    noindex: hasRefinements(parseListingParams(await searchParams)),
  });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/shop/[category]">) {
  const { category: slug } = await params;
  const scope = await resolveScope(slug);
  if (!scope) notFound();

  const basePath = `/shop/${slug}`;
  const listing = parseListingParams(await searchParams);
  const query = toProductQuery(listing, { category: slug }, shopConfig.pageSize);

  const [result, facets, categoryNav] = await Promise.all([
    listProducts(query),
    getListingFacets(query),
    getCategoryNav(basePath),
  ]);
  ensurePageInRange(basePath, listing, result);

  return (
    <>
      <ListingHeader
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }, { label: scope.name }]}
        title={scope.name}
        description={scope.description}
      >
        <CategoryNav items={categoryNav} variant="row" className="mt-8" />
      </ListingHeader>

      <Container className="pt-6 pb-24 md:pt-10 md:pb-32">
        <ProductListing
          basePath={basePath}
          params={listing}
          defaultSort={defaultSort(query)}
          result={result}
          facets={facets}
          showCollectionFacet
          categoryNav={categoryNav}
          preloadCount={3}
        />
      </Container>
    </>
  );
}
