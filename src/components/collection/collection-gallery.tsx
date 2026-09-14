import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { MediaImage } from "@/components/ui/media-image";
import type { MediaAsset } from "@/lib/media/types";

export interface CollectionGalleryProps {
  /** Campaign images after the hero; the first two are shown. */
  images: MediaAsset[];
  label: string;
}

/**
 * An offset pair of campaign photographs between the story and the pieces —
 * the pause that makes a collection read as a chapter rather than a filter.
 */
export function CollectionGallery({ images, label }: CollectionGalleryProps) {
  const [lead, supporting] = images;
  if (!lead) return null;

  return (
    <section aria-label={label} className="pt-20 md:pt-28 xl:pt-36">
      <Container className="grid gap-y-8 md:grid-cols-12 md:gap-x-8">
        <Reveal className={supporting ? "md:col-span-5 md:col-start-2" : "md:col-span-8 md:col-start-3"}>
          <MediaImage image={lead} ratio="4/5" sizes="(min-width: 1920px) 720px, (min-width: 768px) 40vw, 100vw" />
        </Reveal>
        {supporting ? (
          <Reveal delay={0.1} className="md:col-span-4 md:col-start-8 md:mt-40">
            <MediaImage
              image={supporting}
              ratio="4/5"
              sizes="(min-width: 1920px) 580px, (min-width: 768px) 32vw, 100vw"
            />
          </Reveal>
        ) : null}
      </Container>
    </section>
  );
}
