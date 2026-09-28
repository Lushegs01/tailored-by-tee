import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { deleteCollectionAction } from "@/app/admin/collections/actions";
import {
  collectionVisibility,
  deleteCollectionExplanation,
  PHOTOS_HINT,
  pieces,
  PRODUCT_ORDER_HINT,
} from "@/components/admin/collections/collection-copy";
import { EditCollectionForm } from "@/components/admin/collections/collection-form";
import { CollectionPhotos } from "@/components/admin/collections/collection-photos";
import { CollectionPieces } from "@/components/admin/collections/collection-pieces";
import { DeleteRecordDialog } from "@/components/admin/collections/delete-record-dialog";
import { Notice, referenceConsequence, ShopReferenceList } from "@/components/admin/collections/notice";
import { findShopReferences } from "@/components/admin/collections/shop-references";
import { AdminPageHeader, AdminSection, StatusBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { getAdminUser, requireAdminPage } from "@/lib/admin/auth";
import { isCloudinaryConfigured } from "@/lib/admin/cloudinary";
import {
  COLLECTIONS_PATH,
  getAdminCollection,
  getCollectionName,
  listCollectionPhotos,
  listCollectionPieces,
  MAX_COLLECTION_PHOTOS,
} from "@/lib/admin/collections";
import { formatAdminDateTime } from "@/lib/admin/format";
import { adminMetadata } from "@/lib/admin/metadata";

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,191}$/;

export async function generateMetadata(props: PageProps<"/admin/collections/[id]">): Promise<Metadata> {
  // Never look anything up for someone who isn't an admin.
  if (!(await getAdminUser())) return adminMetadata("Collection");
  const { id } = await props.params;
  const name = ID_PATTERN.test(id) ? await getCollectionName(id) : null;
  return adminMetadata(name ? `${name} — Collections` : "Collection not found");
}

/**
 * /admin/collections/[id]: a collection's details (saved with one button), then
 * its pieces and campaign photos (each change saved at once), then deleting it.
 * ?created=1 confirms a new collection (set by the create action's redirect).
 */
export default async function CollectionPage(props: PageProps<"/admin/collections/[id]">) {
  const { id } = await props.params;
  await requireAdminPage(`${COLLECTIONS_PATH}/${encodeURIComponent(id)}`);
  if (!ID_PATTERN.test(id)) notFound();

  const [collection, collectionPieces, photos, searchParams] = await Promise.all([
    getAdminCollection(id),
    listCollectionPieces(id),
    listCollectionPhotos(id),
    props.searchParams,
  ]);
  if (!collection) notFound();

  const created = searchParams.created === "1";
  const references = findShopReferences("collection", collection.slug);
  const visibility = collectionVisibility({
    isPublished: collection.isPublished,
    liveCount: collection.liveProductCount,
  });
  const shopPath = `/collections/${collection.slug}`;

  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title={collection.name}
        breadcrumbs={[{ label: "Collections", href: COLLECTIONS_PATH }, { label: collection.name }]}
        meta={
          <>
            <StatusBadge tone={visibility.tone}>{visibility.label}</StatusBadge>
            {collection.isFeatured ? <StatusBadge tone="info">Featured</StatusBadge> : null}
            <span className="text-muted-foreground tabular-nums">
              {pieces(collection.productCount)} · {collection.liveProductCount} live
            </span>
          </>
        }
        description={
          <>
            {visibility.description}{" "}
            <span className="whitespace-nowrap">Last changed {formatAdminDateTime(collection.updatedAt)}.</span>
          </>
        }
        actions={
          collection.isPublished ? (
            <Button asChild variant="outline" size="sm">
              <a href={shopPath} target="_blank" rel="noopener">
                View in shop<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          ) : null
        }
      />

      {created ? (
        <Notice tone="success" role="status" title="Collection created." className="mt-6">
          <p>
            Now add its pieces and campaign photos below.
            {collection.isPublished ? "" : " It stays hidden from the shop until you tick “Show in the shop”."}
          </p>
        </Notice>
      ) : null}

      <div className="mt-6">
        <EditCollectionForm
          id={collection.id}
          values={{
            name: collection.name,
            slug: collection.slug,
            code: collection.code,
            season: collection.season,
            summary: collection.summary,
            description: collection.description,
            isPublished: collection.isPublished,
            isFeatured: collection.isFeatured,
            heroImage: collection.heroImage,
          }}
          others={collection.others}
          placeAfter={collection.placeAfter}
          references={references}
          liveProductCount={collection.liveProductCount}
        />
      </div>

      <div className="mt-10 space-y-6">
        <AdminSection
          title={`Pieces (${collectionPieces.length})`}
          description={
            <>
              Changes here are saved straight away. {PRODUCT_ORDER_HINT}
            </>
          }
        >
          <CollectionPieces collectionId={collection.id} collectionName={collection.name} pieces={collectionPieces} />
        </AdminSection>

        <AdminSection
          title={`Campaign photos (${photos.length})`}
          description={<>Changes here are saved straight away. {PHOTOS_HINT}</>}
        >
          <CollectionPhotos
            collectionId={collection.id}
            collectionName={collection.name}
            photos={photos}
            heroImageId={collection.heroImage?.id ?? null}
            maxPhotos={MAX_COLLECTION_PHOTOS}
            uploadsEnabled={isCloudinaryConfigured()}
          />
        </AdminSection>

        <AdminSection title="Delete this collection">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-xl text-body-sm text-muted-foreground">
              {deleteCollectionExplanation(collection.name, collection.productCount)} This can’t be undone.
            </p>
            <DeleteRecordDialog
              id={collection.id}
              triggerLabel="Delete collection"
              title={`Delete the collection “${collection.name}”?`}
              confirmLabel="Delete collection"
              action={deleteCollectionAction}
            >
              <p>{deleteCollectionExplanation(collection.name, collection.productCount)}</p>
              <p>
                Its page, <span className="font-mono break-all">{shopPath}</span>, will stop working. This can’t be
                undone.
              </p>
              {references.length > 0 ? (
                <Notice tone="warning" title="The shop links to this collection" className="mt-3">
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
