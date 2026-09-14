import Link from "next/link";

import { MediaImage } from "@/components/ui/media-image";
import type { CollectionSummary } from "@/lib/catalog/types";
import { pluralize } from "@/lib/format";

import { collectionMeta } from "./collection-meta";

export interface CollectionCardProps {
  collection: CollectionSummary;
  sizes: string;
  preload?: boolean;
  headingLevel?: "h2" | "h3";
}

/** Portrait photograph, season line, serif name, one sentence. The whole card is the link. */
export function CollectionCard({ collection, sizes, preload = false, headingLevel: Heading = "h2" }: CollectionCardProps) {
  const image = collection.heroImage ?? collection.images[0] ?? null;
  const meta = collectionMeta(collection);
  const href = `/collections/${collection.slug}`;

  return (
    <article className="group/collection relative">
      <div className="overflow-hidden bg-surface">
        {image ? (
          <MediaImage
            image={image}
            ratio="4/5"
            sizes={sizes}
            preload={preload}
            alt=""
            imageClassName="transition-transform duration-1200 ease-editorial group-hover/collection:scale-[1.03]"
          />
        ) : (
          <div aria-hidden="true" className="aspect-4/5" />
        )}
      </div>

      <div className="mt-5">
        {meta ? <p className="text-eyebrow text-muted-foreground">{meta}</p> : null}
        <Heading className="mt-3 font-display text-display-sm">
          <Link href={href} className="after:absolute after:inset-0">
            <span className="link-underline pb-1 group-hover/collection:bg-size-[100%_1px]">{collection.name}</span>
          </Link>
        </Heading>
        <p className="mt-3 max-w-sm text-body-sm text-muted-foreground">{collection.summary}</p>
        <p className="mt-4 text-caption tabular-nums text-muted-foreground">
          {pluralize(collection.productCount, "piece")}
        </p>
      </div>
    </article>
  );
}
