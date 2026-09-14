import { Container } from "@/components/ui/container";

/**
 * Reviews. Until moderated reviews from verified purchases exist (Phase 10),
 * this says so plainly — no placeholder ratings, no invented quotes.
 */
export function ProductReviews({ productName }: { productName: string }) {
  return (
    <section aria-labelledby="product-reviews-heading" className="pt-20 md:pt-28">
      <Container>
        <div className="grid gap-y-4 border-t pt-10 md:grid-cols-12 md:gap-x-8 md:pt-14">
          <h2 id="product-reviews-heading" className="font-display text-display-sm md:col-span-5">
            Reviews
          </h2>
          <p className="max-w-md text-body text-muted-foreground md:col-span-6 md:col-start-7">
            No reviews yet. Reviews of the {productName} will appear here once clients who have bought it share
            their thoughts.
          </p>
        </div>
      </Container>
    </section>
  );
}
