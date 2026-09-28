import { cn } from "@/lib/utils";

import { imageNotices, type ImageNotice, type RuleImage, type StorefrontPreview } from "./image-rules";

export interface CustomersSeeProps {
  images: readonly (RuleImage & { media: { alt: string } })[];
  preview: StorefrontPreview;
  colors: readonly { id: string; name: string }[];
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

const NOTICE_STYLES: Record<ImageNotice["tone"], { className: string; prefix: string }> = {
  critical: { className: "border-danger text-danger", prefix: "Needs fixing:" },
  attention: { className: "border-accent-brand", prefix: "Check:" },
  info: { className: "border-border-strong text-muted-foreground", prefix: "Note:" },
};

/**
 * "What customers see": where each photo appears on the storefront, worked out
 * exactly as the storefront does (image-rules), followed by anything missing or
 * odd, most serious first.
 */
export function CustomersSee({ images, preview, colors, status }: CustomersSeeProps) {
  const notices = imageNotices({
    images: images.map((image) => ({ ...image, alt: image.media.alt })),
    colors,
    status,
  });
  const number = (id: string | null) => (id ? images.findIndex((image) => image.id === id) + 1 : 0);
  const colourName = (id: string | null) => colors.find((color) => color.id === id)?.name ?? null;

  return (
    <div className="p-4 md:p-5">
      <h3 className="text-label">What customers see</h3>

      {images.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-body-sm">
          <li>
            <span className="text-muted-foreground">Shop cards and search: </span>
            {preview.cardImageId ? (
              <>
                photo {number(preview.cardImageId)}
                {preview.hoverImageId && preview.hoverImageId !== preview.cardImageId
                  ? `, changing to photo ${number(preview.hoverImageId)} when pointed at`
                  : ", with no hover image"}
                .
              </>
            ) : (
              <span className="text-danger">not shown (no main image).</span>
            )}
          </li>
          <li>
            <span className="text-muted-foreground">Product page: </span>
            {images.length === 1 ? "photo 1" : `all ${images.length} photos, in the order below`}
            {preview.opensOnColorId && colors.length > 1
              ? `, opening on ${colourName(preview.opensOnColorId) ?? "a colour no longer offered"}`
              : ""}
            .
          </li>
          {preview.cardImageId ? (
            <li>
              <span className="text-muted-foreground">Bag and orders: </span>
              {colors.length <= 1
                ? `photo ${number(preview.bag[0]?.imageId ?? preview.cardImageId)}.`
                : `${preview.bag
                    .map((line) => {
                      const name = colourName(line.colorId) ?? line.colorId;
                      if (!line.imageId) return `${name}, no photo`;
                      return `${name}, photo ${number(line.imageId)}${line.own ? "" : " (another colour)"}`;
                    })
                    .join("; ")}.`}
            </li>
          ) : null}
        </ul>
      ) : null}

      {notices.length > 0 ? (
        <ul className={cn("space-y-2", images.length > 0 ? "mt-4" : "mt-3")}>
          {notices.map((notice) => (
            <li
              key={notice.text}
              className={cn("border-l-2 pl-3 text-body-sm", NOTICE_STYLES[notice.tone].className)}
            >
              <span className="sr-only">{NOTICE_STYLES[notice.tone].prefix} </span>
              {notice.text}
            </li>
          ))}
        </ul>
      ) : images.length > 0 ? (
        <p className="mt-4 text-body-sm text-success">Everything customers need is in place.</p>
      ) : null}
    </div>
  );
}
