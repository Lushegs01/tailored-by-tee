import { HeroFade } from "@/components/home/hero-fade";
import { MediaImage } from "@/components/ui/media-image";
import type { Collection } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { collectionMeta } from "./collection-meta";

export interface CollectionHeroProps {
  collection: Collection;
  productCount: number;
  headingId: string;
}

/**
 * Campaign opener: the photograph takes seven columns, the story five. On phones
 * the image runs edge to edge and the copy follows. The image is this page's LCP,
 * so it preloads and nothing about it waits on animation.
 */
export function CollectionHero({ collection, productCount, headingId }: CollectionHeroProps) {
  const image = collection.heroImage;
  const meta = collectionMeta(collection);

  return (
    <section aria-labelledby={headingId} className="mt-6 md:mt-10">
      <div className="mx-auto max-w-(--container-max) md:grid md:grid-cols-12 md:gap-x-8 md:px-(--gutter)">
        {image ? (
          <MediaImage
            image={image}
            ratio={null}
            sizes="(min-width: 1920px) 1060px, (min-width: 768px) 58vw, 100vw"
            quality={85}
            preload
            className="aspect-4/5 md:col-span-7 md:col-start-6 md:row-start-1 md:aspect-6/5"
          />
        ) : null}

        <div
          className={cn(
            "px-(--gutter) pt-10 md:row-start-1 md:flex md:flex-col md:justify-end md:px-0 md:pt-0",
            image ? "md:col-span-5 md:col-start-1 lg:pr-8" : "md:col-span-8",
          )}
        >
          <HeroFade delay={0.1}>
            {meta ? <p className="text-eyebrow text-muted-foreground">{meta}</p> : null}
            <h1 id={headingId} className="mt-5 font-display text-display-lg">
              {collection.name}
            </h1>
          </HeroFade>
          <HeroFade delay={0.3}>
            <p className="mt-6 max-w-md text-lead">{collection.summary}</p>
            <p className="mt-5 max-w-md text-body text-muted-foreground">{collection.description}</p>
            <p className="mt-8 text-caption tabular-nums text-muted-foreground">{pluralize(productCount, "piece")}</p>
          </HeroFade>
        </div>
      </div>
    </section>
  );
}
