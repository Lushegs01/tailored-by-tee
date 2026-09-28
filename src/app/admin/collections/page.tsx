import Link from "next/link";

import { FEATURED_HINT, LIVE_PIECE_HINT } from "@/components/admin/collections/collection-copy";
import { CollectionsTable } from "@/components/admin/collections/collections-table";
import { Notice } from "@/components/admin/collections/notice";
import { AdminEmptyState, AdminPageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin/auth";
import { COLLECTIONS_PATH, listAdminCollections } from "@/lib/admin/collections";
import { adminMetadata } from "@/lib/admin/metadata";

export const metadata = adminMetadata("Collections");

function firstValue(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text.slice(0, 80) : null;
}

/**
 * /admin/collections: every collection in the shop's order — how each shows in
 * the shop, its pieces, and move up/down. ?deleted=<name> confirms a deletion
 * (set by the delete action's redirect).
 */
export default async function CollectionsPage(props: PageProps<"/admin/collections">) {
  await requireAdminPage(COLLECTIONS_PATH);
  const searchParams = await props.searchParams;
  const deleted = firstValue(searchParams.deleted);
  const collections = await listAdminCollections();
  const inShop = collections.filter((collection) => collection.isPublished && collection.liveProductCount > 0).length;

  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title="Collections"
        description="Groupings of pieces with their own page in the shop — a season, a capsule, the essentials. The order here is the order on the Collections page and in the menu."
        meta={
          collections.length > 0 ? (
            <span className="text-muted-foreground tabular-nums">
              {collections.length} {collections.length === 1 ? "collection" : "collections"} · {inShop} on the
              Collections page
            </span>
          ) : null
        }
        actions={
          <Button asChild size="sm">
            <Link href={`${COLLECTIONS_PATH}/new`}>New collection</Link>
          </Button>
        }
      />

      {deleted ? (
        <Notice tone="success" role="status" title={`Deleted “${deleted}”.`} className="mt-6">
          <p>Its pieces are still in the shop, and its photos are still in the library.</p>
        </Notice>
      ) : null}

      <div className="mt-6">
        {collections.length > 0 ? (
          <CollectionsTable collections={collections} />
        ) : (
          <div className="border bg-background-raised">
            <AdminEmptyState
              as="h2"
              title="No collections yet"
              body="A collection gathers pieces under one name with its own page, like a season’s release."
              action={
                <Link href={`${COLLECTIONS_PATH}/new`} className="text-body-sm">
                  <span className="link-underline-static pb-0.5">Create the first collection</span>
                </Link>
              }
            />
          </div>
        )}
      </div>

      {collections.length > 0 ? (
        <div className="mt-6 max-w-3xl space-y-2 text-caption text-muted-foreground">
          <p>
            <strong className="font-medium text-foreground">Featured:</strong> {FEATURED_HINT}
          </p>
          <p>
            <strong className="font-medium text-foreground">Live pieces:</strong> {LIVE_PIECE_HINT} A published
            collection with none is left off the Collections page.
          </p>
        </div>
      ) : null}
    </div>
  );
}
