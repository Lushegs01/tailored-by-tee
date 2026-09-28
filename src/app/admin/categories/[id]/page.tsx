import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteCategoryAction } from "@/app/admin/categories/actions";
import { categoryVisibility, deleteCategoryBlocker } from "@/components/admin/categories/category-copy";
import { EditCategoryForm } from "@/components/admin/categories/category-form";
import { DeleteRecordDialog } from "@/components/admin/collections/delete-record-dialog";
import { Notice, referenceConsequence, ShopReferenceList } from "@/components/admin/collections/notice";
import { findShopReferences } from "@/components/admin/collections/shop-references";
import { AdminPageHeader, AdminSection, StatusBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import { CATEGORIES_PATH, getAdminCategory, getCategoryName } from "@/lib/admin/categories";
import { formatAdminDateTime, formatNumber } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";
import { productStatusDisplay } from "@/lib/admin/status";

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,191}$/;

export async function generateMetadata(props: PageProps<"/admin/categories/[id]">): Promise<Metadata> {
  // Never look anything up for someone who isn't an admin.
  if (!(await getAdminUser())) return adminMetadata("Category");
  const { id } = await props.params;
  const name = ID_PATTERN.test(id) ? await getCategoryName(id) : null;
  return adminMetadata(name ? `${name} — Categories` : "Category not found");
}

/**
 * /admin/categories/[id]: a category's details, saved with one button, then the
 * products in it and deleting it. The SKU code is locked once any product here
 * has colours and sizes — the form says so and the server refuses a change.
 * ?created=1 confirms a new category (set by the create action's redirect).
 */
export default async function CategoryPage(props: PageProps<"/admin/categories/[id]">) {
  const { id } = await props.params;
  await requireAdminPage(`${CATEGORIES_PATH}/${encodeURIComponent(id)}`);
  if (!ID_PATTERN.test(id)) notFound();

  const [category, searchParams] = await Promise.all([getAdminCategory(id), props.searchParams]);
  if (!category) notFound();

  const created = searchParams.created === "1";
  const references = findShopReferences("category", category.slug);
  const visibility = categoryVisibility(category.liveProductCount);
  const blocker = deleteCategoryBlocker(category.productCount, category.couponCodes);
  const shopPath = `/shop/${category.slug}`;

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title={category.name}
        breadcrumbs={[{ label: "Categories", href: CATEGORIES_PATH }, { label: category.name }]}
        meta={
          <>
            <StatusBadge tone={visibility.tone}>{visibility.label}</StatusBadge>
            <span className="font-mono text-muted-foreground">{category.code}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatNumber(category.productCount)} {category.productCount === 1 ? "product" : "products"} ·{" "}
              {formatNumber(category.liveProductCount)} live
            </span>
          </>
        }
        description={
          <>
            {visibility.description}{" "}
            <span className="whitespace-nowrap">Last changed {formatAdminDateTime(category.updatedAt)}.</span>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={shopPath} target="_blank" rel="noopener">
              View in shop<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        }
      />

      {created ? (
        <Notice tone="success" role="status" title="Category created." className="mt-6">
          <p>
            It has a page at <span className="font-mono break-all">{shopPath}</span> straight away. It joins the Shop
            menu once it has a live product with at least one photo.
          </p>
        </Notice>
      ) : null}

      <div className="mt-6">
        <EditCategoryForm
          id={category.id}
          values={{
            name: category.name,
            slug: category.slug,
            code: category.code,
            description: category.description,
            image: category.image,
          }}
          others={category.others}
          placeAfter={category.placeAfter}
          variantCount={category.variantCount}
          references={references}
          liveProductCount={category.liveProductCount}
        />
      </div>

      <div className="mt-10 space-y-6">
        <AdminSection
          title={`Products (${formatNumber(category.productCount)})`}
          description="Every product belongs to exactly one category. Change a product's category on the product itself."
          actions={
            category.productCount > 0 ? (
              <Link
                href={`/admin/products?category=${encodeURIComponent(category.slug)}`}
                className="text-body-sm whitespace-nowrap"
              >
                <span className="link-underline-static pb-0.5">View all products</span>
              </Link>
            ) : null
          }
        >
          {category.products.length > 0 ? (
            <>
              <ul className="divide-y border">
                {category.products.map((product) => {
                  const status = productStatusDisplay(product.status);
                  return (
                    <li key={product.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
                      <Link
                        href={`/admin/products/${encodeURIComponent(product.id)}`}
                        className="min-w-0 flex-1 font-medium break-words underline-offset-4 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="font-mono text-caption text-muted-foreground">{product.code}</span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
              {category.productCount > category.products.length ? (
                <p className="mt-3 text-caption text-muted-foreground">
                  Showing the {category.products.length} changed most recently, of{" "}
                  {formatNumber(category.productCount)}.
                </p>
              ) : null}
              <p className="mt-3 text-caption text-muted-foreground">
                <Link href={`/admin/inventory?category=${encodeURIComponent(category.slug)}`}>
                  <span className="link-underline-static pb-0.5">View stock in this category</span>
                </Link>
              </p>
            </>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Nothing in this category yet. Products are added from{" "}
              <Link href="/admin/products">
                <span className="link-underline-static pb-0.5">Products</span>
              </Link>
              .
            </p>
          )}
        </AdminSection>

        <AdminSection title="Delete this category">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl text-body-sm text-muted-foreground">
              <p>
                This removes the category and its page, <span className="font-mono break-all">{shopPath}</span>. This
                can’t be undone.
              </p>
              {blocker ? <p className="mt-2 text-foreground">{blocker}</p> : null}
            </div>
            <DeleteRecordDialog
              id={category.id}
              triggerLabel="Delete category"
              title={`Delete the category “${category.name}”?`}
              confirmLabel="Delete category"
              action={deleteCategoryAction}
              disabled={blocker !== null}
            >
              <p>
                This removes the category and its page, <span className="font-mono break-all">{shopPath}</span>. Its
                photo stays in the library. This can’t be undone.
              </p>
              <p>
                The code <span className="font-mono">{category.code}</span> becomes free for another category. SKUs on
                past orders keep the code they were given.
              </p>
              {references.length > 0 ? (
                <Notice tone="warning" title="The shop links to this category" className="mt-3">
                  <ShopReferenceList references={references} className="mt-0" />
                  <p className="mt-2">{referenceConsequence(references)}</p>
                </Notice>
              ) : null}
            </DeleteRecordDialog>
          </div>
        </AdminSection>
      </div>
    </div>
  );
}
