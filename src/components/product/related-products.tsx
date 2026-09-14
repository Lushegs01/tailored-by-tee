import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import type { ProductCardData } from "@/lib/catalog/types";

import { ProductGrid } from "./product-grid";

export interface RelatedProductsProps {
  id: string;
  eyebrow?: string;
  /** Supports *emphasis*. */
  title: string;
  products: ProductCardData[];
}

/** A four-up shelf of cross-sells. Renders nothing when there is nothing worth suggesting. */
export function RelatedProducts({ id, eyebrow, title, products }: RelatedProductsProps) {
  if (products.length === 0) return null;

  return (
    <section aria-labelledby={id} className="pt-20 md:pt-28">
      <Container>
        <SectionHeading id={id} eyebrow={eyebrow} title={title} size="sm" layout="stacked" />
        <ProductGrid products={products} columns={4} className="mt-8 md:mt-10" headingLevel="h3" />
      </Container>
    </section>
  );
}
