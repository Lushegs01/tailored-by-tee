import type { Metadata } from "next";

import { CollectionCard } from "@/components/collection/collection-card";
import { EmptyState } from "@/components/feedback/empty-state";
import { ListingHeader } from "@/components/listing/listing-header";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { getCollectionSummaries } from "@/lib/catalog/repository";
import { pageMetadata } from "@/lib/seo/metadata";

const DESCRIPTION =
  "Seasonal chapters from the studio, alongside the pieces we keep on the rail all year round.";

export const metadata: Metadata = pageMetadata({
  title: "Collections",
  description: DESCRIPTION,
  path: "/collections",
});

export default async function CollectionsPage() {
  // Featured first, then the editor's order; empty collections would be dead ends.
  const collections = (await getCollectionSummaries())
    .filter((collection) => collection.productCount > 0)
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder);

  return (
    <>
      <ListingHeader
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Collections" }]}
        title="Collections"
        description={DESCRIPTION}
      />

      <Container className="pt-12 pb-24 md:pt-16 md:pb-32">
        {collections.length > 0 ? (
          <ul className="grid gap-x-(--gutter) gap-y-16 border-t pt-10 md:grid-cols-2 md:pt-12 lg:grid-cols-3">
            {collections.map((collection, index) => (
              <li key={collection.id}>
                <CollectionCard
                  collection={collection}
                  sizes="(min-width: 1920px) 590px, (min-width: 1024px) 31vw, (min-width: 768px) 47vw, 100vw"
                  preload={index < 2}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="The next chapter is *in the studio.*"
            body="New collections are being finished. Until then, everything in stock is in the shop."
            actions={<TextLink href="/shop">Shop all pieces</TextLink>}
            className="py-20"
          />
        )}
      </Container>
    </>
  );
}
