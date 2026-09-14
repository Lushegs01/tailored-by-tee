import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { ProductGrid } from "@/components/product/product-grid";
import { SUGGESTED_SEARCHES, normaliseQuery, searchPageHref } from "@/components/search/search-config";
import { SearchPageForm } from "@/components/search/search-page-form";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";
import { siteConfig } from "@/config/site";
import { MAX_SEARCH_RESULTS, searchCatalog } from "@/lib/catalog/repository";
import type { SearchResults } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";
import { pageMetadata } from "@/lib/seo/metadata";

function readQuery(params: Record<string, string | string[] | undefined>): string {
  const raw = params.q;
  return normaliseQuery(typeof raw === "string" ? raw : (raw?.[0] ?? ""));
}

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const query = readQuery(await searchParams);
  // Result pages are thin, ever-changing copies of the catalogue: never indexed.
  return pageMetadata({
    title: query ? `Search results for “${query}”` : "Search",
    description: siteConfig.description,
    path: "/search",
    noindex: true,
  });
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const query = readQuery(await searchParams);
  const results = query ? await searchCatalog(query, MAX_SEARCH_RESULTS) : null;

  return (
    <Container className="pt-10 pb-24 md:pt-16 md:pb-32">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-eyebrow text-muted-foreground">Search</p>
        <SearchPageForm defaultValue={query} />
      </div>

      {results ? <Results results={results} /> : <Idle />}
    </Container>
  );
}

function Suggestions({ centred = false }: { centred?: boolean }) {
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-1 ${centred ? "justify-center" : ""}`}>
      {SUGGESTED_SEARCHES.map((term) => (
        <li key={term}>
          <Link href={searchPageHref(term)} className="inline-flex min-h-11 items-center font-display text-display-xs">
            <span className="link-underline pb-0.5">{term}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Idle() {
  return (
    <section aria-labelledby="search-idle-heading" className="mx-auto mt-16 max-w-3xl md:mt-20">
      <h1 id="search-idle-heading" className="text-eyebrow text-muted-foreground">
        Popular searches
      </h1>
      <div className="mt-4">
        <Suggestions />
      </div>
    </section>
  );
}

function Results({ results }: { results: SearchResults }) {
  const { query, products } = results;
  const terms = [...results.categories, ...results.collections];

  return (
    <section aria-labelledby="search-results-heading" className="mt-14 md:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b pb-5">
        <h1 id="search-results-heading" className="font-display text-display-sm">
          Results for <em className="italic">“{query}”</em>
        </h1>
        <p role="status" className="text-caption tabular-nums text-muted-foreground">
          {pluralize(products.length, "piece")}
        </p>
      </div>

      {terms.length > 0 ? (
        <nav aria-label="Matching categories and collections" className="mt-5 flex flex-wrap items-center gap-x-6">
          <span className="text-eyebrow text-muted-foreground">Also see</span>
          {terms.map((term) => (
            <Link key={term.href} href={term.href} className="inline-flex min-h-11 items-center text-body-sm">
              <span className="link-underline-static pb-0.5">{term.name}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {products.length > 0 ? (
        <ProductGrid
          products={products}
          columns={4}
          className="mt-10 md:mt-12"
          preloadCount={4}
          headingLevel="h2"
          animate={false}
        />
      ) : (
        <EmptyState
          as="h2"
          size="sm"
          className="py-20 md:py-24"
          // Asterisks are emphasis markers in titles; a query must never be able to set its own.
          title={`Nothing matched *“${query.replace(/\*/g, "")}.”*`}
          body="Check the spelling, try a broader word — a cloth, a colour, a category — or start from one of these."
          actions={<TextLink href="/shop">Shop all pieces</TextLink>}
        >
          <Suggestions centred />
        </EmptyState>
      )}
    </section>
  );
}
