import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { MediaImage } from "@/components/ui/media-image";
import type { CategoryIndexBlock } from "@/lib/content/types";
import { pluralize } from "@/lib/format";

import { CategoryIndexList } from "./category-index-list";
import type { CategoryIndexEntry } from "./data";

export interface CategoryIndexProps {
  block: CategoryIndexBlock;
  entries: CategoryIndexEntry[];
  headingId: string;
}

/** Shown in place of a photograph when a category has none. */
function CategoryFallback({ name }: { name: string }) {
  return (
    <div className="flex size-full items-end bg-surface p-5">
      <span className="font-display text-display-xs">{name}</span>
    </div>
  );
}

/**
 * The wardrobe as a typographic index. Desktop: names set large beside a sticky
 * image that follows the pointer. Below lg: a swipeable row of 3:4 tiles.
 */
export function CategoryIndex({ block, entries, headingId }: CategoryIndexProps) {
  const links = entries.map(({ slug, name, href, count }) => ({ slug, name, href, count }));
  const stack = entries.map((entry) =>
    entry.image ? (
      <MediaImage
        key={entry.slug}
        image={entry.image}
        ratio={null}
        className="size-full"
        sizes="(min-width: 1024px) 32vw, 100vw"
      />
    ) : (
      <CategoryFallback key={entry.slug} name={entry.name} />
    ),
  );

  return (
    <section aria-labelledby={headingId} className="py-20 md:py-28 xl:py-36">
      <Container>
        <div className="border-t pt-6 md:pt-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-8">
          <Reveal className="lg:col-span-3">
            <p className="text-eyebrow text-muted-foreground">{block.eyebrow}</p>
            <h2 id={headingId} className="mt-5 font-display text-display-sm">
              <Emphasis text={block.title} />
            </h2>
          </Reveal>

          <CategoryIndexList
            entries={links}
            media={stack}
            listClassName="hidden lg:col-span-5 lg:col-start-4 lg:block"
            mediaClassName="hidden lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:col-span-4 lg:col-start-9 lg:block"
          />
        </div>
      </Container>

      <ul className="mt-10 flex snap-x snap-mandatory scroll-px-(--gutter) gap-3 overflow-x-auto px-(--gutter) py-2 scrollbar-none md:mt-12 md:gap-4 lg:hidden">
        {entries.map((entry) => (
          <li key={entry.slug} className="w-[64%] shrink-0 snap-start sm:w-[40%] md:w-[30%]">
            <Link href={entry.href} className="group/tile block">
              {entry.image ? (
                <MediaImage
                  image={entry.image}
                  ratio="3/4"
                  sizes="(min-width: 768px) 30vw, (min-width: 640px) 40vw, 64vw"
                  imageClassName="transition-[scale] duration-1000 ease-editorial group-hover/tile:scale-[1.03]"
                />
              ) : (
                <div className="aspect-3/4">
                  <CategoryFallback name={entry.name} />
                </div>
              )}
              <span className="mt-3 flex items-baseline justify-between gap-3">
                <span className="text-label">{entry.name}</span>
                <span className="text-micro tabular-nums text-muted-foreground">
                  <span aria-hidden="true">{entry.count}</span>
                  <span className="sr-only">{pluralize(entry.count, "piece")}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
