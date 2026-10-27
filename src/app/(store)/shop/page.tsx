import type { Metadata } from "next";

import { CategoryNav } from "@/components/listing/category-nav";
import { ensurePageInRange, getCategoryNav } from "@/components/listing/data";
import { ListingHeader } from "@/components/listing/listing-header";
import { ProductListing } from "@/components/listing/product-listing";
import { Container } from "@/components/ui/container";
import { shopConfig } from "@/config/shop";
import { hasRefinements, parseListingParams, toProductQuery } from "@/lib/catalog/listing-params";
import { defaultSort } from "@/lib/catalog/query";
import { getListingFacets, listProducts } from "@/lib/catalog/repository";
import { pageMetadata } from "@/lib/seo/metadata";

const BASE_PATH = "/shop";

export async function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  const params = parseListingParams(await searchParams);
  return pageMetadata({
    title: "Shop all",
    description: shopConfig.description,
    path: BASE_PATH,
    noindex: hasRefinements(params),
  });
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = parseListingParams(await searchParams);
  const query = toProductQuery(params, {}, shopConfig.pageSize);

  const [result, facets, categoryNav] = await Promise.all([
    listProducts(query),
    getListingFacets(query),
    getCategoryNav(BASE_PATH),
  ]);
  ensurePageInRange(BASE_PATH, params, result);

  return (
    <>
      <ListingHeader
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Shop" }]}
        title={shopConfig.title}
        description={shopConfig.description}
      >
        <CategoryNav items={categoryNav} variant="row" className="mt-8" />
      </ListingHeader>

      <Container className="pt-6 pb-24 md:pt-10 md:pb-32">
        <ProductListing
          basePath={BASE_PATH}
          params={params}
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
