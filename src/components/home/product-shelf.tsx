import { Reveal } from "@/components/motion/reveal";
import { ProductCarousel } from "@/components/product/product-carousel";
import { ProductGrid } from "@/components/product/product-grid";
import { Container } from "@/components/ui/container";
import { stripEmphasis } from "@/components/ui/emphasis";
import { SectionHeading } from "@/components/ui/section-heading";
import type { ProductCardData } from "@/lib/catalog/types";
import type { ProductShelfBlock } from "@/lib/content/types";

export interface ProductShelfProps {
  block: ProductShelfBlock;
  products: ProductCardData[];
  headingId: string;
}

/**
 * Products between the editorial moments. "grid" is a composed four-up; "carousel"
 * keeps its heading on the page grid while the track runs full-bleed.
 */
export function ProductShelf({ block, products, headingId }: ProductShelfProps) {
  const heading = (
    <SectionHeading
      id={headingId}
      eyebrow={block.eyebrow}
      title={block.title}
      description={block.description}
      action={block.cta}
    />
  );

  if (block.layout === "carousel") {
    return (
      <section id={block.id} aria-labelledby={headingId} className="py-20 md:py-28 xl:py-32">
        <Container>
          <Reveal>{heading}</Reveal>
        </Container>
        <div className="mt-10 md:mt-14">
          <ProductCarousel products={products} label={stripEmphasis(block.title)} />
        </div>
      </section>
    );
  }

  return (
    <section id={block.id} aria-labelledby={headingId} className="py-16 md:py-20 xl:py-24">
      <Container>
        <Reveal>{heading}</Reveal>
        <div className="mt-10 md:mt-14">
          {/* Below the fold: nothing here may preload. */}
          <ProductGrid products={products} columns={4} preloadCount={0} />
        </div>
      </Container>
    </section>
  );
}
