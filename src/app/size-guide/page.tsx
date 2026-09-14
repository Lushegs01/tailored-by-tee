import type { Metadata } from "next";

import { ListingHeader } from "@/components/listing/listing-header";
import { SizeGuideTable } from "@/components/product/size-guide-table";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { SIZE_GUIDES } from "@/config/size-guides";
import { pageMetadata } from "@/lib/seo/metadata";

const DESCRIPTION =
  "Body measurements for every size we cut, with how to take your own. Each product page also notes how that piece fits.";

export const metadata: Metadata = pageMetadata({ title: "Size guide", description: DESCRIPTION, path: "/size-guide" });

export default function SizeGuidePage() {
  const guides = Object.values(SIZE_GUIDES);

  return (
    <>
      <ListingHeader
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Size guide" }]}
        title="Size guide"
        description={DESCRIPTION}
      />

      <Container className="pt-12 pb-24 md:pt-16 md:pb-32">
        <nav aria-label="Size guides" className="flex flex-wrap gap-x-8 border-y py-2">
          {guides.map((guide) => (
            <a key={guide.id} href={`#${guide.id}`} className="inline-flex min-h-11 items-center text-label">
              <span className="link-underline pb-0.5">{guide.title}</span>
            </a>
          ))}
        </nav>

        <div className="mt-4">
          {guides.map((guide) => (
            <section
              key={guide.id}
              id={guide.id}
              aria-labelledby={`${guide.id}-heading`}
              // grid-cols-1 is minmax(0, 1fr): the track may shrink, so the table scrolls in its own box.
              className="grid grid-cols-1 gap-y-6 border-b py-14 last:border-b-0 md:grid-cols-12 md:gap-x-8 md:py-20"
            >
              <div className="md:col-span-4">
                <h2 id={`${guide.id}-heading`} className="font-display text-display-sm">
                  {guide.title}
                </h2>
                <p className="mt-4 max-w-sm text-body-sm text-muted-foreground">{guide.intro}</p>
              </div>
              <SizeGuideTable guide={guide} className="md:col-span-8" />
            </section>
          ))}
        </div>

        <div className="mt-6 border-t pt-8">
          <p className="max-w-md text-body-sm text-muted-foreground">
            Still unsure? Tell us your measurements and the piece you have in mind, and we&rsquo;ll suggest a size.
          </p>
          <TextLink href="/contact" className="mt-5">
            Ask the studio
          </TextLink>
        </div>
      </Container>
    </>
  );
}
