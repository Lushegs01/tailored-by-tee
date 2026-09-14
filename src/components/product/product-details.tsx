import { Container } from "@/components/ui/container";
import type { ProductDetail } from "@/lib/catalog/types";

/** The long read below the fold: the story, the construction, the cloth and its care. */
export function ProductDetails({ product }: { product: ProductDetail }) {
  return (
    <section aria-labelledby="product-details-heading" className="pt-20 md:pt-28">
      <Container>
        <div className="grid gap-y-12 border-t pt-10 md:grid-cols-12 md:gap-x-8 md:pt-14">
          <div className="md:col-span-6 lg:col-span-5">
            <h2 id="product-details-heading" className="text-eyebrow text-muted-foreground">
              The piece
            </h2>
            <p className="mt-5 max-w-xl text-lead">{product.description}</p>
          </div>

          <div className="md:col-span-6 lg:col-span-3 lg:col-start-7">
            <h3 className="text-eyebrow text-muted-foreground">Details</h3>
            <ul className="mt-5 space-y-2.5 text-body-sm">
              {product.details.map((detail) => (
                <li key={detail} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-border-strong" />
                  {detail}
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-6 md:col-start-7 lg:col-span-3 lg:col-start-10">
            <h3 className="text-eyebrow text-muted-foreground">Material & care</h3>
            <p className="mt-5 text-body-sm">{product.material}</p>
            <ul className="mt-4 space-y-1.5 text-body-sm text-muted-foreground">
              {product.care.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
