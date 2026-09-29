"use client";

import { useRef, useState, useTransition } from "react";

import { addProductImage, moveProductImage } from "@/app/admin/products/[id]/image-actions";
import { MediaPickerDialog, type MediaChooseResult } from "@/components/admin/media/media-picker-dialog";
import { AdminEmptyState, AdminSection } from "@/components/admin/ui";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { AdminMedia } from "@/lib/admin/media";

import { MAX_PRODUCT_IMAGES, inPhotoOrder, storefrontPreview, type ImageRole } from "./image-rules";
import { CustomersSee } from "./customers-see";
import { ProductImageItem } from "./product-image-item";

export interface ManagedImage {
  id: string;
  role: ImageRole;
  colorId: string | null;
  /** The colour's name, including colours the product no longer offers. */
  colorName: string | null;
  position: number;
  media: {
    id: string;
    url: string;
    width: number;
    height: number;
    alt: string;
    color: string;
    /** Other places using the same photo (its description is shared with them). */
    otherUses: number;
  };
}

export interface ProductImagesManagerProps {
  productId: string;
  productName: string;
  productStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
  colors: { id: string; name: string; hex: string }[];
  images: ManagedImage[];
  uploadsEnabled: boolean;
}

/** Drops the routine first sentence of an "added" message, keeping any advice after it. */
function adviceFrom(note: string | null): string | null {
  return note?.replace(/^Photo (added|uploaded)\.\s*/, "").trim() || null;
}

/**
 * The product's photos, in order, with what customers see, the rules, and the
 * controls to add, edit, reorder and remove. Data comes from the server
 * (ProductImagesSection); every action refreshes the page with fresh data.
 */
export function ProductImagesManager({
  productId,
  productName,
  productStatus,
  colors,
  images: unordered,
  uploadsEnabled,
}: ProductImagesManagerProps) {
  const images = inPhotoOrder(unordered);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [moving, startMoving] = useTransition();
  const addButton = useRef<HTMLButtonElement>(null);
  /** After a move, the photo (and direction) whose button should get focus back once the list re-renders. */
  const pendingFocusRef = useRef<{ imageId: string; direction: "up" | "down" } | null>(null);

  const colorIds = colors.map((color) => color.id);
  const preview = storefrontPreview(images, colorIds);
  const full = images.length >= MAX_PRODUCT_IMAGES;

  async function attach(media: AdminMedia, note: string | null): Promise<MediaChooseResult> {
    const result = await addProductImage({ productId, mediaId: media.id });
    if (!result.ok) return { ok: false, message: result.message };
    const advice = adviceFrom(note);
    setAnnouncement({ text: [result.message, advice].filter(Boolean).join(" "), tone: "success" });
    return { ok: true };
  }

  function move(imageId: string, direction: "up" | "down") {
    if (moving) return;
    pendingFocusRef.current = { imageId, direction };
    startMoving(async () => {
      let result: Awaited<ReturnType<typeof moveProductImage>>;
      try {
        result = await moveProductImage({ productId, imageId, direction });
      } catch {
        result = { ok: false, message: "Something went wrong. Refresh the page to check, then try again." };
      }
      if (!result.ok) pendingFocusRef.current = null;
      setAnnouncement({ text: result.message ?? "Photo moved.", tone: result.ok ? "success" : "error" });
    });
  }

  function afterRemove(message: string | undefined) {
    setAnnouncement({ text: message ?? "Photo removed.", tone: "success" });
    // The removed photo's buttons have gone: return focus to the section.
    setTimeout(() => addButton.current?.focus(), 0);
  }

  const addLabel = images.length === 0 ? "Add the first photo" : "Add a photo";

  return (
    <>
      <AdminSection
        id="product-photos"
        title="Photos"
        description={`Customers see these in this order. Each colour can have one main image and one hover image. Up to ${MAX_PRODUCT_IMAGES} photos.`}
        actions={
          images.length > 0 ? (
            <Button
              ref={addButton}
              type="button"
              variant="outline"
              size="sm"
              aria-haspopup="dialog"
              disabled={full}
              onClick={() => setPickerOpen(true)}
            >
              <PlusIcon aria-hidden="true" className="text-base" />
              {full ? "Photo limit reached" : addLabel}
            </Button>
          ) : null
        }
        flush
      >
        <CustomersSee images={images} preview={preview} colors={colors} status={productStatus} />

        {images.length === 0 ? (
          <AdminEmptyState
            title="No photos yet"
            body="Start with the main image — the photo on shop cards. Then add a hover image, and any gallery photos and close-ups."
            action={
              <Button
                ref={addButton}
                type="button"
                variant="outline"
                size="sm"
                aria-haspopup="dialog"
                onClick={() => setPickerOpen(true)}
              >
                <PlusIcon aria-hidden="true" className="text-base" />
                {addLabel}
              </Button>
            }
          />
        ) : (
          <ol aria-label={`Photos of ${productName}, in order`} className="divide-y border-t">
            {images.map((image, index) => (
              <ProductImageItem
                key={image.id}
                productId={productId}
                image={image}
                images={images}
                index={index}
                colors={colors}
                isCardImage={preview.cardImageId === image.id}
                isHoverImage={preview.hoverImageId === image.id}
                moving={moving}
                onMove={move}
                onRemoved={afterRemove}
                pendingFocusRef={pendingFocusRef}
              />
            ))}
          </ol>
        )}

        <div
          role="status"
          aria-live="polite"
          className={announcement ? "border-t px-4 py-3 text-body-sm md:px-5" : "sr-only"}
        >
          {announcement ? (
            <p className={announcement.tone === "error" ? "text-danger" : "text-foreground"}>
              {announcement.text}
            </p>
          ) : null}
        </div>
      </AdminSection>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={`Add a photo to ${productName}`}
        description="Choose from the media library, upload a new photo, or add one by its web address."
        chooseLabel="Add to product"
        unavailableIds={images.map((image) => image.media.id)}
        unavailableLabel="On this product"
        uploadsEnabled={uploadsEnabled}
        onChoose={attach}
      />
    </>
  );
}
