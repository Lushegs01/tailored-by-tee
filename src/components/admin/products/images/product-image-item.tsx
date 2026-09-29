"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { removeProductImage, updateProductImage } from "@/app/admin/products/[id]/image-actions";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { ALT_TEXT_HINT, ALT_TEXT_LABEL } from "@/components/admin/media/media-copy";
import {
  AdminForm,
  ConfirmDialog,
  FormStatus,
  SelectField,
  StatusBadge,
  SubmitButton,
  TextAreaField,
  type SelectOption,
} from "@/components/admin/ui";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ALT_TEXT_MAX, imageSizeAdvice } from "@/lib/admin/image-probe";
import { cn } from "@/lib/utils";

import {
  IMAGE_ROLES,
  IMAGE_ROLE_HINTS,
  IMAGE_ROLE_LABELS,
  imagesToDemote,
  isExclusiveRole,
  type ImageRole,
} from "./image-rules";
import type { ManagedImage } from "./product-images-manager";

export interface ProductImageItemProps {
  productId: string;
  image: ManagedImage;
  /** All the product's photos, in order (for numbering and the one-per-colour hint). */
  images: readonly ManagedImage[];
  index: number;
  colors: readonly { id: string; name: string; hex: string }[];
  isCardImage: boolean;
  isHoverImage: boolean;
  /** A move is in progress somewhere in the list. */
  moving: boolean;
  onMove: (imageId: string, direction: "up" | "down") => void;
  onRemoved: (message: string | undefined) => void;
  pendingFocusRef: RefObject<{ imageId: string; direction: "up" | "down" } | null>;
}

const ROLE_OPTIONS: SelectOption[] = IMAGE_ROLES.map((role) => ({
  value: role,
  label: IMAGE_ROLE_LABELS[role],
}));

/**
 * One photo in the product's list: its thumbnail in the shop's 4:5 frame, where
 * it appears, a form for its role, colour and description, and buttons to move
 * it or take it off the product.
 */
export function ProductImageItem({
  productId,
  image,
  images,
  index,
  colors,
  isCardImage,
  isHoverImage,
  moving,
  onMove,
  onRemoved,
  pendingFocusRef,
}: ProductImageItemProps) {
  const number = index + 1;
  const last = index === images.length - 1;
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  // The form's fields are controlled so they follow the server's data after any
  // save — including this photo being turned into a gallery photo by another's save.
  const serverKey = `${image.role}|${image.colorId ?? ""}|${image.media.alt}`;
  const [synced, setSynced] = useState(serverKey);
  const [role, setRole] = useState<ImageRole>(image.role);
  const [colorId, setColorId] = useState(image.colorId ?? "");
  const [alt, setAlt] = useState(image.media.alt);
  if (synced !== serverKey) {
    setSynced(serverKey);
    setRole(image.role);
    setColorId(image.colorId ?? "");
    setAlt(image.media.alt);
  }
  const dirty = role !== image.role || colorId !== (image.colorId ?? "") || alt !== image.media.alt;

  // After this photo moves, give focus back to the button that moved it (or the
  // other one, at either end of the list), since re-ordering can drop focus.
  useEffect(() => {
    const request = pendingFocusRef.current;
    if (!request || request.imageId !== image.id) return;
    pendingFocusRef.current = null;
    const target = request.direction === "up" ? (index === 0 ? downRef : upRef) : last ? upRef : downRef;
    target.current?.focus();
  }, [index, last, image.id, pendingFocusRef]);

  const colorOptions: SelectOption[] = [
    { value: "", label: "All colours" },
    ...colors.map((color) => ({ value: color.id, label: color.name })),
  ];
  if (image.colorId && !colors.some((color) => color.id === image.colorId)) {
    colorOptions.push({
      value: image.colorId,
      label: `${image.colorName ?? image.colorId} (no longer offered)`,
    });
  }
  const colourLabel = (id: string | null) =>
    id === null ? "All colours" : (colorOptions.find((option) => option.value === id)?.label ?? id);
  const swatch = image.colorId ? colors.find((color) => color.id === image.colorId)?.hex : undefined;

  // Saving a main or hover image for a colour turns that colour's current one into a gallery photo.
  const displaced = imagesToDemote(images, { id: image.id, role, colorId: colorId || null });
  const roleHint = (
    <>
      {IMAGE_ROLE_HINTS[role]}
      {isExclusiveRole(role) && displaced.length > 0 && dirty ? (
        <span className="mt-1 block text-accent-brand">
          Saving makes photo {images.indexOf(displaced[0]) + 1} a gallery photo: it’s the current{" "}
          {IMAGE_ROLE_LABELS[role].toLowerCase()} for {colorId ? colourLabel(colorId) : "all colours"}.
        </span>
      ) : null}
    </>
  );

  const advice = imageSizeAdvice(image.media);
  const onlyMain =
    image.role === "PRIMARY" && images.filter((other) => other.role === "PRIMARY").length === 1;
  const moveLabel = (direction: "up" | "down") =>
    `Move photo ${number} ${direction === "up" ? "earlier" : "later"}`;

  return (
    <li className="p-4 md:p-5">
      <div className="flex gap-4">
        <MediaThumb media={image.media} alt="" sizes="7rem" className="w-20 shrink-0 sm:w-28" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-body-sm font-medium">
              Photo {number}
              <span className="sr-only"> of {images.length}</span>
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
              <span>{IMAGE_ROLE_LABELS[image.role]}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                {swatch ? (
                  <span
                    aria-hidden="true"
                    className="inline-block size-2.5 border"
                    style={{ backgroundColor: swatch }}
                  />
                ) : null}
                {colourLabel(image.colorId)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {image.media.width.toLocaleString("en-GB")} × {image.media.height.toLocaleString("en-GB")} px
              </span>
            </p>
            {isCardImage || isHoverImage ? (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {isCardImage ? <StatusBadge tone="positive">On shop cards</StatusBadge> : null}
                {isHoverImage ? <StatusBadge tone="info">Card hover</StatusBadge> : null}
              </p>
            ) : null}
            {advice ? <p className="mt-2 max-w-prose text-caption text-accent-brand">{advice}</p> : null}
          </div>

          <div
            className="flex shrink-0 items-center gap-1"
            role="group"
            aria-label={`Order of photo ${number}`}
          >
            <MoveButton
              buttonRef={upRef}
              label={moveLabel("up")}
              unavailable={index === 0 || moving}
              onClick={() => onMove(image.id, "up")}
              direction="up"
            />
            <MoveButton
              buttonRef={downRef}
              label={moveLabel("down")}
              unavailable={last || moving}
              onClick={() => onMove(image.id, "down")}
              direction="down"
            />
          </div>
        </div>
      </div>

      <AdminForm action={updateProductImage} className="mt-4 grid gap-4 sm:pl-32 md:grid-cols-2" noValidate>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="imageId" value={image.id} />
        <SelectField
          name="role"
          label="Used as"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(event) => setRole(event.target.value as ImageRole)}
          hint={roleHint}
        />
        <SelectField
          name="colorId"
          label="Colour"
          options={colorOptions}
          value={colorId}
          onChange={(event) => setColorId(event.target.value)}
          hint="Which colourway this photo shows. “All colours” suits photos that apply to every colour."
        />
        <TextAreaField
          name="alt"
          label={ALT_TEXT_LABEL}
          rows={2}
          maxLength={ALT_TEXT_MAX}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          hint={
            image.media.otherUses > 0
              ? `${ALT_TEXT_HINT} This photo is used in ${image.media.otherUses} other place${image.media.otherUses === 1 ? "" : "s"} too, and the description changes there as well.`
              : ALT_TEXT_HINT
          }
          className="md:col-span-2"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:col-span-2">
          <SubmitButton variant="outline" disabled={!dirty}>
            Save photo {number}
          </SubmitButton>
          <FormStatus className="sm:flex-1" />
          <ConfirmDialog
            tone="destructive"
            title={`Remove photo ${number} from this product?`}
            confirmLabel="Remove photo"
            pendingLabel="Removing…"
            action={() => removeProductImage({ productId, imageId: image.id })}
            onSuccess={(result) => onRemoved(result.message)}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start text-danger sm:ml-auto sm:self-auto"
              >
                Remove from product
              </Button>
            }
          >
            <p>The photo stays in the media library, so you can add it back later.</p>
            {onlyMain ? (
              <p className="text-danger">
                This is the product’s only main image. Without one, the product won’t appear in the shop until
                you choose another.
              </p>
            ) : null}
          </ConfirmDialog>
        </div>
      </AdminForm>
    </li>
  );
}

function MoveButton({
  buttonRef,
  label,
  unavailable,
  onClick,
  direction,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  label: string;
  unavailable: boolean;
  onClick: () => void;
  direction: "up" | "down";
}) {
  // aria-disabled rather than disabled, so focus stays on the button when it
  // reaches either end of the list.
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={unavailable || undefined}
      onClick={() => {
        if (!unavailable) onClick();
      }}
      className={cn(
        "inline-flex size-10 items-center justify-center border text-lg transition-colors",
        unavailable ? "cursor-not-allowed text-muted-foreground/50" : "hover:border-foreground",
      )}
    >
      <ChevronDownIcon aria-hidden="true" className={direction === "up" ? "rotate-180" : undefined} />
    </button>
  );
}
