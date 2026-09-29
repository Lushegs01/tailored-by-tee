import Link from "next/link";

import { Notice } from "@/components/admin/collections/notice";
import { ProductBulkBar } from "@/components/admin/products/product-bulk-bar";
import { ARCHIVED_HIDDEN_HINT, PRODUCTS_INTRO, SEARCH_LABEL, SEARCH_PLACEHOLDER } from "@/components/admin/products/product-copy";
import { ProductSelectAll, ProductSelectionProvider } from "@/components/admin/products/product-selection";
import { ProductsTable } from "@/components/admin/products/products-table";
import {
  AdminEmptyState,
  AdminPageHeader,
  ListToolbar,
  Pagination,
  type ListToolbarFilter,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { buildListHref, parseListParams } from "@/lib/admin/pagination";
import {
  NEW_PRODUCT_PATH,
  PRODUCTS_PATH,
  PRODUCT_LIST_ALLOWED,
  PRODUCT_STATUS_ALL,
  PRODUCT_STOCK_FILTER_OPTIONS,
  canPublish,
} from "@/lib/admin/product-schema";
import { getProductFormOptions, listAdminProducts } from "@/lib/admin/products";
import { PRODUCT_STATUS_OPTIONS } from "@/lib/admin/status";

export const metadata = adminMetadata("Products");

function firstValue(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text.slice(0, 80) : null;
}

/**
 * /admin/products: every piece in the studio, newest change first. Search by
 * name, code or SKU; filter by status, category, collection and stock; tick
 * several to publish, move to draft or archive them together.
 *
 * ?created=1 and ?deleted=<name> confirm a change made on another page.
 */
export default async function ProductsPage(props: PageProps<"/admin/products">) {
  await requireAdminPage(PRODUCTS_PATH);

  const [searchParams, options] = await Promise.all([props.searchParams, getProductFormOptions()]);
  const params = parseListParams(searchParams, {
    ...PRODUCT_LIST_ALLOWED,
    filterValues: {
      ...PRODUCT_LIST_ALLOWED.filterValues,
      category: options.categories.map((category) => category.slug),
      collection: options.collections.map((collection) => collection.slug),
    },
  });

  const category = options.categories.find((item) => item.slug === params.filters.category) ?? null;
  const collection = options.collections.find((item) => item.slug === params.filters.collection) ?? null;

  const { rows, total, page, truncated } = await listAdminProducts(params, {
    categoryId: category?.id ?? null,
    collectionId: collection?.id ?? null,
  });
  const shown = { ...params, page };
  const now = new Date();

  const deleted = firstValue(searchParams.deleted);
  const filtered = params.q !== "" || Object.keys(params.filters).length > 0;
  const showingArchived =
    params.filters.status === "ARCHIVED" || params.filters.status === PRODUCT_STATUS_ALL;

  const filters: ListToolbarFilter[] = [
    {
      name: "status",
      label: "Status",
      allLabel: "Live and draft",
      options: [...PRODUCT_STATUS_OPTIONS, { value: PRODUCT_STATUS_ALL, label: "All, including archived" }],
    },
    {
      name: "category",
      label: "Category",
      allLabel: "All categories",
      options: options.categories.map((item) => ({ value: item.slug, label: item.name })),
    },
    {
      name: "collection",
      label: "Collection",
      allLabel: "All collections",
      options: options.collections.map((item) => ({ value: item.slug, label: item.name })),
    },
    { name: "stock", label: "Stock", allLabel: "Any stock level", options: PRODUCT_STOCK_FILTER_OPTIONS },
  ];

  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    readyToPublish: canPublish({
      price: row.price,
      imageCount: row.imageCount,
      hasPrimaryImage: row.hasPrimaryImage,
      variantCount: row.variantCount,
      activeVariantCount: row.activeVariantCount,
      availableToSell: row.available,
      hasCopy: true,
    }),
  }));

  return (
    <>
      <AdminPageHeader
        title="Products"
        description={PRODUCTS_INTRO}
        meta={
          total > 0 ? (
            <span className="text-muted-foreground tabular-nums">
              {formatNumber(total)} {total === 1 ? "product" : "products"}
              {category ? ` in ${category.name}` : ""}
              {collection ? ` in ${collection.name}` : ""}
            </span>
          ) : null
        }
        actions={
          <Button asChild size="sm">
            <Link href={NEW_PRODUCT_PATH}>New product</Link>
          </Button>
        }
      />

      {deleted ? <Notice tone="success" role="status" title={`Deleted “${deleted}”.`} className="mt-6" /> : null}

      <ListToolbar
        className="mt-6"
        searchLabel={SEARCH_LABEL}
        searchPlaceholder={SEARCH_PLACEHOLDER}
        filters={filters}
      />

      {truncated ? (
        <Notice tone="info" className="mt-4">
          <p>
            There are more products than the stock filter looks through at once. Narrow the list with a search or
            another filter to be sure you are seeing everything.
          </p>
        </Notice>
      ) : null}

      <ProductSelectionProvider items={items}>
        <div className="mt-4">
          {rows.length > 0 ? (
            <>
              <ProductSelectAll />
              <div className="mt-2">
                <ProductsTable rows={rows} params={shown} now={now} />
              </div>
              <ProductBulkBar />
            </>
          ) : (
            <div className="border bg-background-raised">
              {filtered ? (
                <AdminEmptyState
                  as="h2"
                  title="Nothing matches"
                  body="No products match this search and these filters. Try another search, or clear the filters."
                  action={
                    <Link href={buildListHref(PRODUCTS_PATH, params, { clear: true })} className="text-body-sm">
                      <span className="link-underline-static pb-0.5">Clear search and filters</span>
                    </Link>
                  }
                />
              ) : (
                <AdminEmptyState
                  as="h2"
                  title="No products yet"
                  body="Create the first piece: give it a name, a category and a price, then add its words, photos, colours and sizes."
                  action={
                    <Button asChild size="sm">
                      <Link href={NEW_PRODUCT_PATH}>New product</Link>
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
      </ProductSelectionProvider>

      <Pagination
        base={PRODUCTS_PATH}
        params={shown}
        total={total}
        noun={{ one: "product", other: "products" }}
      />

      {rows.length > 0 && !showingArchived ? (
        <p className="mt-6 max-w-3xl text-caption text-muted-foreground">{ARCHIVED_HIDDEN_HINT}</p>
      ) : null}
    </>
  );
}
