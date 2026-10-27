import { CartDrawer } from "@/components/cart/cart-drawer";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { AppProviders } from "@/components/providers/app-providers";
import { SearchOverlay } from "@/components/search/search-overlay";
import { JsonLd, organizationJsonLd } from "@/components/seo/json-ld";
import { accountsEnabled } from "@/lib/auth/config";

/**
 * Everything a shopper sees around a storefront page: the header, footer, bag
 * drawer and search overlay, and the client state they share. Used by the
 * (store) layout and by the 404 for URLs that match nothing at all, which
 * renders outside that layout.
 */
export function StorefrontFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {/* Configuration only (is sign-in possible at all), so every page stays static. */}
      <AppProviders accounts={accountsEnabled}>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter />
        <CartDrawer />
        <SearchOverlay />
      </AppProviders>
      <JsonLd data={organizationJsonLd()} />
    </>
  );
}
