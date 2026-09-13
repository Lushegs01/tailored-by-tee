import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Emphasis } from "@/components/ui/emphasis";
import { MediaImage } from "@/components/ui/media-image";
import { TextLink } from "@/components/ui/text-link";
import type { SplitStoryBlock } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";

export interface SplitStoryProps {
  block: SplitStoryBlock;
  image: MediaAsset;
  headingId: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Seven columns of photograph against five of copy, with an optional numbered
 * index of pieces. On phones the image runs edge to edge and the copy follows.
 */
export function SplitStory({ block, image, headingId }: SplitStoryProps) {
  const { eyebrow, title, body, items, cta } = block;
  const imageRight = block.imageSide === "right";

  return (
    <section aria-labelledby={headingId} className="py-20 md:py-28 xl:py-36">
      <div className="mx-auto max-w-(--container-max) md:grid md:grid-cols-12 md:items-center md:gap-x-8 md:px-(--gutter)">
        <Reveal className={`md:col-span-7 md:row-start-1 ${imageRight ? "md:col-start-6" : "md:col-start-1"}`}>
          <MediaImage image={image} ratio="4/5" sizes="(min-width: 768px) 55vw, 100vw" />
        </Reveal>

        <div
          className={`px-(--gutter) pt-12 md:col-span-5 md:row-start-1 md:px-0 md:pt-0 ${
            imageRight ? "md:col-start-1" : "md:col-start-8"
          }`}
        >
          <div className={imageRight ? "lg:pr-10 xl:pr-16" : "lg:pl-10 xl:pl-16"}>
            <Reveal>
              <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
              <h2 id={headingId} className="mt-5 font-display text-display-md">
                <Emphasis text={title} />
              </h2>
              <p className="mt-6 max-w-md text-body text-muted-foreground">{body}</p>
            </Reveal>

            {items && items.length > 0 ? (
              <RevealGroup className="mt-10 md:mt-12">
                <ol className="border-t">
                  {items.map((item, index) => (
                    <RevealItem as="li" key={item.href} className="border-b">
                      <Link href={item.href} className="group/item flex min-h-14 items-center gap-5 py-4">
                        {/* The <ol> already conveys order; the numeral is visual. */}
                        <span aria-hidden="true" className="w-6 shrink-0 text-micro tabular-nums text-muted-foreground">
                          {pad(index + 1)}
                        </span>
                        <span className="flex-1 text-body transition-[translate] duration-500 ease-editorial group-hover/item:translate-x-1">
                          {item.label}
                        </span>
                        <ArrowRightIcon className="shrink-0 -translate-x-3 opacity-0 transition-[opacity,translate] duration-500 ease-editorial group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-visible/item:translate-x-0 group-focus-visible/item:opacity-100" />
                      </Link>
                    </RevealItem>
                  ))}
                </ol>
              </RevealGroup>
            ) : null}

            {cta ? (
              <Reveal delay={0.1} className="mt-10 md:mt-12">
                <TextLink href={cta.href}>{cta.label}</TextLink>
              </Reveal>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
