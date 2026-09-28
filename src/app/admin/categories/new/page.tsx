import { NewCategoryForm } from "@/components/admin/categories/category-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { CATEGORIES_PATH, listCategoryCodes, listCategoryOrder } from "@/lib/admin/categories";
import { adminMetadata } from "@/lib/admin/metadata";

export const metadata = adminMetadata("New category");

/** /admin/categories/new */
export default async function NewCategoryPage() {
  await requireAdminPage(`${CATEGORIES_PATH}/new`);
  const [others, takenCodes] = await Promise.all([listCategoryOrder(), listCategoryCodes()]);

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title="New category"
        breadcrumbs={[{ label: "Categories", href: CATEGORIES_PATH }, { label: "New category" }]}
        description="A new section of the shop. It appears in the Shop menu once it has a live product with photos."
      />
      <div className="mt-6">
        <NewCategoryForm others={others} takenCodes={takenCodes} />
      </div>
    </div>
  );
}
