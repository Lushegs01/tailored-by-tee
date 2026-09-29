import Link from "next/link";

import { InventoryFeedbackProvider } from "@/components/admin/inventory/inventory-feedback";
import { InventorySummary } from "@/components/admin/inventory/inventory-summary";
import { InventoryTable } from "@/components/admin/inventory/inventory-table";
import {
  AdminEmptyState,
  AdminPageHeader,
  ListToolbar,
  Pagination,
  type ListToolbarFilter,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { getInventoryCategories, listInventory } from "@/lib/admin/inventory";
import { adminMetadata } from "@/lib/admin/metadata";
import { buildListHref } from "@/lib/admin/pagination";
import { PRODUCT_STATUS_OPTIONS } from "@/lib/admin/status";
import {
  INVENTORY_EXPORT_PATH,
  INVENTORY_PATH,
  SHOW_INACTIVE,
  STATUS_ALL,
  STOCK_STATE_OPTIONS,
  parseInventoryListParams,
  toInventoryListQuery,
} from "@/lib/admin/stock-state";

export const metadata = adminMetadata("Inventory");

/**
 * /admin/inventory: stock for every colour and size, least available first.
 * Search by SKU or product name; filter by stock level, category, product status
 * and switched-off variants; adjust, count, set low-stock levels and read each
 * variant's history from its row; export what's shown as CSV.
 */
export default async function InventoryPage(props: PageProps<"/admin/inventory">) {
  await requireAdminPage(INVENTORY_PATH);

  const parsed = parseInventoryListParams(await props.searchParams);
  const categories = await getInventoryCategories();
  const query = toInventoryListQuery(
    parsed,
    categories.map((category) => category.slug),
  );
  const { rows, total, page, summary } = await listInventory(query);
  const params = { ...parsed, page };

  const filtered = params.q !== "" || Object.keys(params.filters).length > 0;
  const exportHref = buildListHref(INVENTORY_EXPORT_PATH, params, { page: 1 });

  const filters: ListToolbarFilter[] = [
    { name: "state", label: "Stock level", allLabel: "All stock levels", options: STOCK_STATE_OPTIONS },
    {
      name: "category",
      label: "Category",
      allLabel: "All categories",
      options: categories.map((category) => ({ value: category.slug, label: category.name })),
    },
    {
      name: "status",
      label: "Product status",
      allLabel: "Live and draft products",
      options: [...PRODUCT_STATUS_OPTIONS, { value: STATUS_ALL, label: "All, including archived" }],
    },
    {
      name: "inactive",
      label: "Switched-off variants",
      allLabel: "Hide switched-off variants",
      options: [{ value: SHOW_INACTIVE, label: "Show switched-off variants" }],
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Inventory"
        description={
          <>
            Stock for every colour and size (each one a variant).{" "}
            <strong className="font-medium">Available to sell</strong> is what’s on hand minus the pieces held
            for checkouts waiting for payment.
          </>
        }
        actions={
          total > 0 ? (
            <Button asChild variant="outline" size="sm">
              <a href={exportHref} download>
                Export CSV<span className="sr-only"> of the variants shown</span>
              </a>
            </Button>
          ) : null
        }
      />

      <InventorySummary summary={summary} params={params} className="mt-6" />

      <ListToolbar
        className="mt-8"
        searchLabel="Search stock by SKU or product name"
        searchPlaceholder="SKU or product name"
        filters={filters}
      />

      <InventoryFeedbackProvider>
        <div className="mt-4">
          {rows.length > 0 ? (
            <InventoryTable rows={rows} params={params} />
          ) : (
            <div className="border bg-background-raised">
              {filtered ? (
                <AdminEmptyState
                  as="h2"
                  title="Nothing matches"
                  body="No variants match this search and these filters. Try another search, or clear the filters."
                  action={
                    <Link
                      href={buildListHref(INVENTORY_PATH, params, { clear: true })}
                      className="text-body-sm"
                    >
                      <span className="link-underline-static pb-0.5">Clear search and filters</span>
                    </Link>
                  }
                />
              ) : (
                <AdminEmptyState
                  as="h2"
                  title="No stock to show yet"
                  body="Stock is kept for each colour and size of a product. Give a product its colours and sizes and they’ll appear here, ready for their first delivery. Archived products and switched-off variants are hidden unless you choose to show them."
                  action={
                    <Link href="/admin/products" className="text-body-sm">
                      <span className="link-underline-static pb-0.5">Go to products</span>
                    </Link>
                  }
                />
              )}
            </div>
          )}
        </div>
      </InventoryFeedbackProvider>

      <Pagination
        base={INVENTORY_PATH}
        params={params}
        total={total}
        noun={{ one: "variant", other: "variants" }}
      />
    </>
  );
}
