import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { MediaImage } from "@/components/ui/media-image";
import { TextLink } from "@/components/ui/text-link";
import type { BrandStoryBlock } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";

export interface BrandStoryProps {
  block: BrandStoryBlock;
  image: MediaAsset;
  detailImage: MediaAsset | null;
  headingId: string;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/**
 * The studio's point of view: a portrait with a close detail laid over its
 * corner, like two prints on a table, beside the principles the work follows.
 */
export function BrandStory({ block, image, detailImage, headingId }: BrandStoryProps) {
  const { eyebrow, title, body, principles, cta } = block;

  return (
    <section aria-labelledby={headingId} className="py-24 md:py-32 xl:py-40">
      <Container className="grid grid-cols-1 gap-y-20 md:gap-y-24 lg:grid-cols-12 lg:items-center lg:gap-x-8">
        <div className={detailImage ? "relative mb-12 lg:col-span-6 lg:mb-16" : "lg:col-span-6"}>
          <Reveal className={detailImage ? "w-[84%] md:w-[78%] lg:w-full" : undefined}>
            <MediaImage
              image={image}
              ratio="4/5"
              sizes={detailImage ? "(min-width: 1024px) 46vw, 80vw" : "(min-width: 1024px) 46vw, 100vw"}
            />
          </Reveal>

          {detailImage ? (
            // Paper mat keeps a crisp edge where the two photographs meet.
            <Reveal
              delay={0.15}
              className="absolute -bottom-12 right-0 w-[44%] bg-background p-2 md:w-[40%] md:p-3 lg:-bottom-16 lg:-right-12 xl:-right-16"
            >
              <MediaImage image={detailImage} ratio="1/1" sizes="(min-width: 1024px) 19vw, 44vw" />
            </Reveal>
          ) : null}
        </div>

        <div className="lg:col-span-5 lg:col-start-8">
          <Reveal>
            <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
            <h2 id={headingId} className="mt-5 font-display text-display-md">
              <Emphasis text={title} />
            </h2>
            <p className="mt-6 max-w-md text-body text-muted-foreground">{body}</p>
          </Reveal>

          {principles.length > 0 ? (
            <RevealGroup as="ul" className="mt-10 border-t md:mt-12">
              {principles.map((principle, index) => (
                <RevealItem
                  as="li"
                  key={principle.title}
                  className="grid grid-cols-[2.75rem_1fr] gap-x-4 border-b py-6 md:py-7"
                >
                  <span aria-hidden="true" className="font-display text-body italic text-muted-foreground">
                    {ROMAN[index] ?? index + 1}
                  </span>
                  <div>
                    <h3 className="text-label">{principle.title}</h3>
                    <p className="mt-3 max-w-sm text-body-sm text-muted-foreground">{principle.body}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          ) : null}

          {cta ? (
            <Reveal delay={0.1} className="mt-10 md:mt-12">
              <TextLink href={cta.href}>{cta.label}</TextLink>
            </Reveal>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
