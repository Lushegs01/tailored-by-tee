import { siteConfig } from "@/config/site";
import { isPurchasable } from "@/lib/catalog/inventory";
import type { ProductDetail } from "@/lib/catalog/types";

type JsonLdData = Record<string, unknown> | Record<string, unknown>[];

/** Structured data. `<` is escaped so content can never close the script tag. */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export interface BreadcrumbItem {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: new URL(item.href, siteConfig.url).toString() } : {}),
    })),
  };
}

/** schema.org Product with a single NGN offer (every variant shares the product price). */
export function productJsonLd(product: ProductDetail) {
  const url = new URL(`/product/${product.slug}`, siteConfig.url).toString();
  const inStock = product.variants.some(isPurchasable);
  // SKUs are TBT-<category>-<product>-<colour>-<size>; the first three parts name the product.
  const productCode = product.variants[0]?.sku.split("-").slice(0, 3).join("-");

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    url,
    image: product.images.map((image) => image.src),
    ...(productCode ? { sku: productCode } : {}),
    brand: { "@type": "Brand", name: siteConfig.name },
    category: product.category.name,
    material: product.material,
    color: product.colors.map((color) => color.name).join(", "),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "NGN",
      price: (product.price / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: siteConfig.name },
    },
  };
}

export function organizationJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
      email: siteConfig.contact.email,
      sameAs: siteConfig.social.map((link) => link.href),
      address: {
        "@type": "PostalAddress",
        streetAddress: siteConfig.contact.address,
        addressLocality: "Lagos",
        addressCountry: "NG",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteConfig.url}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
