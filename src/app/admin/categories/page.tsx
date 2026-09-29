import Link from "next/link";

import { CategoriesTable } from "@/components/admin/categories/categories-table";
import { LIVE_PIECE_HINT } from "@/components/admin/collections/collection-copy";
import { Notice } from "@/components/admin/collections/notice";
import { AdminEmptyState, AdminPageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { CATEGORIES_PATH, listAdminCategories } from "@/lib/admin/categories";
import { adminMetadata } from "@/lib/admin/metadata";

export const metadata = adminMetadata("Categories");

function firstValue(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text.slice(0, 80) : null;
}

/**
 * /admin/categories: every category in the shop's order with its SKU code,
 * products and move up/down. ?deleted=<name> confirms a deletion (set by the
 * delete action's redirect).
 */
export default async function CategoriesPage(props: PageProps<"/admin/categories">) {
  await requireAdminPage(CATEGORIES_PATH);
  const searchParams = await props.searchParams;
  const deleted = firstValue(searchParams.deleted);
  const categories = await listAdminCategories();
  const inMenu = categories.filter((category) => category.liveProductCount > 0).length;

  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title="Categories"
        description="The sections of the shop — every product belongs to exactly one. The order here is the order in the Shop menu and above product lists."
        meta={
          categories.length > 0 ? (
            <span className="text-muted-foreground tabular-nums">
              {categories.length} {categories.length === 1 ? "category" : "categories"} · {inMenu} in the Shop menu
            </span>
          ) : null
        }
        actions={
          <Button asChild size="sm">
            <Link href={`${CATEGORIES_PATH}/new`}>New category</Link>
          </Button>
        }
      />

      {deleted ? (
        <Notice tone="success" role="status" title={`Deleted “${deleted}”.`} className="mt-6" />
      ) : null}

      <div className="mt-6">
        {categories.length > 0 ? (
          <CategoriesTable categories={categories} />
        ) : (
          <div className="border bg-background-raised">
            <AdminEmptyState
              as="h2"
              title="No categories yet"
              body="Every product needs a category, so create one before adding products."
              action={
                <Link href={`${CATEGORIES_PATH}/new`} className="text-body-sm">
                  <span className="link-underline-static pb-0.5">Create the first category</span>
                </Link>
              }
            />
          </div>
        )}
      </div>

      {categories.length > 0 ? (
        <p className="mt-6 max-w-3xl text-caption text-muted-foreground">
          <strong className="font-medium text-foreground">Live products:</strong> {LIVE_PIECE_HINT} A category with
          none is left out of the Shop menu, though its page still works.
        </p>
      ) : null}
    </div>
  );
}
