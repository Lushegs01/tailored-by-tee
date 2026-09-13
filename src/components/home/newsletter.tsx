import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { MediaImage } from "@/components/ui/media-image";
import type { NewsletterBlock } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import { cn } from "@/lib/utils";

import { NewsletterForm } from "./newsletter-form";

export interface NewsletterProps {
  block: NewsletterBlock;
  image: MediaAsset | null;
  headingId: string;
}

/**
 * The Journal: a quiet linen band that closes the page. A small portrait sits
 * beside the sign-up when there is one; otherwise the copy centres on the grid.
 * Anchored as #journal so the footer and campaigns can link straight to it.
 */
export function Newsletter({ block, image, headingId }: NewsletterProps) {
  const { eyebrow, title, body } = block;

  return (
    <section id="journal" aria-labelledby={headingId} className="bg-surface py-20 md:py-24 xl:py-32">
      <Container className="grid grid-cols-1 gap-y-12 md:grid-cols-12 md:items-center md:gap-x-8">
        {image ? (
          <Reveal className="w-[46%] max-w-[15rem] md:col-span-4 md:w-auto md:max-w-none lg:col-span-3 lg:col-start-2">
            <MediaImage
              image={image}
              ratio="4/5"
              sizes="(min-width: 1024px) 20vw, (min-width: 768px) 30vw, 46vw"
            />
          </Reveal>
        ) : null}

        <div
          className={cn(
            image ? "md:col-span-8 md:col-start-5 lg:col-span-6 lg:col-start-6" : "md:col-span-8 md:col-start-3",
          )}
        >
          <Reveal>
            <p className="text-eyebrow text-foreground/75">{eyebrow}</p>
            <h2 id={headingId} className="mt-5 font-display text-display-md">
              <Emphasis text={title} />
            </h2>
            <p className="mt-6 max-w-md text-body text-foreground/75">{body}</p>
          </Reveal>

          <Reveal delay={0.1} className="mt-10 max-w-xl md:mt-12">
            <NewsletterForm />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
