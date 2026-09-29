/*
 * How a product's photos reach customers, and the rules the admin enforces so
 * they do so predictably. Pure: shared by the server actions (which enforce the
 * rules) and the images section (which explains them).
 *
 * What the storefront does with ProductImage (lib/catalog/mappers.ts findImage,
 * repository.ts, app/product/[slug]/page.tsx, lib/catalog/purchase.ts):
 * - Shop cards, search results, collections and "you may also like" show the
 *   product's MAIN image (role PRIMARY): the first one, in photo order, that is
 *   for all colours or for the product's first colour — failing that, any main
 *   image. A product with no main image gets no card, so it is missing from every
 *   listing (its own page still opens from a direct link). A product with no
 *   photos at all is hidden completely.
 * - The HOVER image (ALTERNATE) is picked the same way and swapped in when a
 *   shopper points at the card.
 * - The bag, checkout and order lines show the main image for the colour bought,
 *   falling back to the card's main image.
 * - The product page shows every photo — all roles, all colours — in photo
 *   order, and opens on the colour of the first main image ("Photographed in …").
 * - GALLERY and DETAIL (close-up) photos appear on the product page only.
 *
 * The rule the admin enforces: at most one main image and one hover image per
 * colour, where "all colours" counts as one more colour. Making a photo the main
 * (or hover) image for a colour turns the previous one into a gallery photo, so
 * which photo a card or bag line shows is never ambiguous.
 */

export type ImageRole = "PRIMARY" | "ALTERNATE" | "GALLERY" | "DETAIL";

export const IMAGE_ROLES = [
  "PRIMARY",
  "ALTERNATE",
  "GALLERY",
  "DETAIL",
] as const satisfies readonly ImageRole[];

export const IMAGE_ROLE_LABELS: Record<ImageRole, string> = {
  PRIMARY: "Main image",
  ALTERNATE: "Hover image",
  GALLERY: "Gallery",
  DETAIL: "Close-up",
};

export const IMAGE_ROLE_HINTS: Record<ImageRole, string> = {
  PRIMARY:
    "Shown on shop cards, in search and collections, and in the bag for its colour. One per colour: choosing another turns this one into a gallery photo.",
  ALTERNATE: "Swapped in when a shopper points at the shop card. One per colour.",
  GALLERY: "Shown on the product page only.",
  DETAIL: "A close-up of fabric or finishing. Shown on the product page only.",
};

/** Most photos one product can have. */
export const MAX_PRODUCT_IMAGES = 24;

/** Roles each colour (or "all colours") may have only one of. */
export function isExclusiveRole(role: ImageRole): role is "PRIMARY" | "ALTERNATE" {
  return role === "PRIMARY" || role === "ALTERNATE";
}

export interface RuleImage {
  id: string;
  role: ImageRole;
  /** null: shown for every colour. */
  colorId: string | null;
  position: number;
}

/** Photos in the order customers see them (position, then id for ties). */
export function inPhotoOrder<T extends RuleImage>(images: readonly T[]): T[] {
  return [...images].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The photo the storefront shows for `role` — the same choice as findImage in
 * lib/catalog/mappers.ts: this colour's own photo, else the first for all colours
 * or the product's first colour, else the first of that role.
 */
export function storefrontImage<T extends RuleImage>(
  images: readonly T[],
  role: ImageRole,
  productColorIds: readonly string[],
  colorId?: string,
): T | null {
  const candidates = inPhotoOrder(images).filter((image) => image.role === role);
  return (
    candidates.find((image) => colorId !== undefined && image.colorId === colorId) ??
    candidates.find((image) => image.colorId === null || image.colorId === productColorIds[0]) ??
    candidates[0] ??
    null
  );
}

/** The role a newly added photo starts with: main image first, then hover image, then gallery. */
export function defaultRoleForNewImage(images: readonly RuleImage[]): ImageRole {
  if (!images.some((image) => image.role === "PRIMARY")) return "PRIMARY";
  if (!images.some((image) => image.role === "ALTERNATE")) return "ALTERNATE";
  return "GALLERY";
}

/**
 * Photos that must become gallery photos when photo `change.id` takes `change.role`
 * for `change.colorId`: the others holding that exclusive role for the same colour.
 */
export function imagesToDemote<T extends RuleImage>(
  images: readonly T[],
  change: { id: string | null; role: ImageRole; colorId: string | null },
): T[] {
  if (!isExclusiveRole(change.role)) return [];
  return images.filter(
    (image) => image.id !== change.id && image.role === change.role && image.colorId === change.colorId,
  );
}

/** The order after moving `id` one place up or down, or null when it can't move that way. */
export function moveInOrder(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export interface StorefrontPreview {
  /** The card's main image. */
  cardImageId: string | null;
  /** The card's hover image. */
  hoverImageId: string | null;
  /** The product page gallery, in order. */
  galleryIds: string[];
  /** The colour the product page opens on (the first main image's colour), when it names one. */
  opensOnColorId: string | null;
  /** Per product colour: the photo on bag, checkout and order lines, and whether it is that colour's own. */
  bag: { colorId: string; imageId: string | null; own: boolean }[];
}

/** What customers see, computed exactly as the storefront does. */
export function storefrontPreview(
  images: readonly RuleImage[],
  productColorIds: readonly string[],
): StorefrontPreview {
  const ordered = inPhotoOrder(images);
  const card = storefrontImage(ordered, "PRIMARY", productColorIds);
  const hover = storefrontImage(ordered, "ALTERNATE", productColorIds);
  const firstMain = ordered.find((image) => image.role === "PRIMARY") ?? null;
  return {
    cardImageId: card?.id ?? null,
    hoverImageId: hover?.id ?? null,
    galleryIds: ordered.map((image) => image.id),
    opensOnColorId: firstMain?.colorId ?? null,
    bag: productColorIds.map((colorId) => {
      const image = storefrontImage(ordered, "PRIMARY", productColorIds, colorId);
      return {
        colorId,
        imageId: image?.id ?? null,
        own: image !== null && (image.colorId === colorId || image.colorId === null),
      };
    }),
  };
}

export interface ImageNotice {
  tone: "critical" | "attention" | "info";
  text: string;
}

export interface NoticeInput {
  images: readonly (RuleImage & { alt: string })[];
  colors: readonly { id: string; name: string }[];
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Problems and gaps in a product's photos, most serious first, in plain words for the owner. */
export function imageNotices({ images, colors, status }: NoticeInput): ImageNotice[] {
  const notices: ImageNotice[] = [];
  const ordered = inPhotoOrder(images);
  const colorIds = colors.map((color) => color.id);
  const photo = (id: string) => `photo ${ordered.findIndex((image) => image.id === id) + 1}`;
  const Photo = (id: string) => `Photo ${ordered.findIndex((image) => image.id === id) + 1}`;
  const live = status === "ACTIVE";

  if (ordered.length === 0) {
    notices.push(
      live
        ? {
            tone: "critical",
            text: "This product is live but has no photos, so customers can’t see it anywhere. Add a main image.",
          }
        : {
            tone: "attention",
            text: "Add photos before making this product live: products without photos stay hidden from the shop.",
          },
    );
    return notices;
  }

  const preview = storefrontPreview(ordered, colorIds);

  if (!preview.cardImageId) {
    notices.push(
      live
        ? {
            tone: "critical",
            text: "There’s no main image, so this product is missing from the shop, search and collections (its own page still opens from a direct link). Make one photo the main image.",
          }
        : {
            tone: "attention",
            text: "Choose a main image before making this product live, or it won’t appear in the shop.",
          },
    );
  }

  for (const image of ordered) {
    if (image.colorId !== null && !colorIds.includes(image.colorId)) {
      notices.push({
        tone: "attention",
        text: `${Photo(image.id)} is marked for a colour this product no longer comes in. Choose one of its colours or “All colours”.`,
      });
    }
  }

  const undescribed = ordered.filter((image) => image.alt.trim() === "");
  if (undescribed.length > 0) {
    notices.push({
      tone: "attention",
      text: `${listNames(undescribed.map((image) => Photo(image.id)))} ${undescribed.length === 1 ? "has" : "have"} no description. Add one so customers using screen readers know what ${undescribed.length === 1 ? "it shows" : "they show"}.`,
    });
  }

  if (preview.cardImageId && !preview.hoverImageId) {
    notices.push({
      tone: "info",
      text: "There’s no hover image, so shop cards stay still when a shopper points at them.",
    });
  }

  if (colors.length > 1 && preview.cardImageId) {
    const borrowing = preview.bag.filter((line) => !line.own && line.imageId !== null);
    if (borrowing.length > 0) {
      const names = borrowing.map(
        (line) => colors.find((color) => color.id === line.colorId)?.name ?? line.colorId,
      );
      notices.push({
        tone: "info",
        text: `${listNames(names)} ${names.length === 1 ? "has" : "have"} no main image of ${names.length === 1 ? "its" : "their"} own, so the bag and orders show another colour’s photo. Give each colour a main image so customers see what they chose.`,
      });
    }
  }

  if (preview.cardImageId && ordered[0].id !== preview.cardImageId) {
    notices.push({
      tone: "info",
      text: `The product page starts with photo 1, but shop cards show ${photo(preview.cardImageId)}. Move the main image to the top if you’d like them to match.`,
    });
  }

  return notices;
}

/** What addProductImage (app/admin/products/[id]/image-actions.ts) returns on success. */
export interface AddedProductImage {
  imageId: string;
  role: ImageRole;
}
