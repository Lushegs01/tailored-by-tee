import { Container } from "@/components/ui/container";

import { FooterBottom } from "./footer/footer-bottom";
import { FooterBrand } from "./footer/footer-brand";
import { FooterNav } from "./footer/footer-nav";

/**
 * A visually quiet close to every page: brand signature on the left, link columns
 * on an offset grid to the right, a hairline legal line beneath.
 */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container>
        <div className="grid gap-y-14 py-16 md:gap-y-16 md:py-24 lg:grid-cols-12 lg:gap-x-8">
          <FooterBrand className="lg:col-span-4" />
          <FooterNav className="lg:col-span-7 lg:col-start-6" />
        </div>
        <FooterBottom className="pb-8 md:pb-10" />
      </Container>
    </footer>
  );
}
