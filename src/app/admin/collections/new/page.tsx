import { NewCollectionForm } from "@/components/admin/collections/collection-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/admin/auth";
import { COLLECTIONS_PATH, listCollectionOrder } from "@/lib/admin/collections";
import { adminMetadata } from "@/lib/admin/metadata";

export const metadata = adminMetadata("New collection");

/** /admin/collections/new: name it, describe it, choose a photo; add pieces on the next page. */
export default async function NewCollectionPage() {
  await requireAdminPage(`${COLLECTIONS_PATH}/new`);
  const others = await listCollectionOrder();

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title="New collection"
        breadcrumbs={[{ label: "Collections", href: COLLECTIONS_PATH }, { label: "New collection" }]}
        description="Start with its name and story. Once it’s created you can add its pieces and campaign photos."
      />
      <div className="mt-6">
        <NewCollectionForm others={others} />
      </div>
    </div>
  );
}
