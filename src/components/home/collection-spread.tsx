import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { MediaImage } from "@/components/ui/media-image";
import type { CollectionSpreadBlock } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import { cn } from "@/lib/utils";

export interface CollectionSpreadProps {
  block: CollectionSpreadBlock;
  lead: MediaAsset;
  supporting: MediaAsset | null;
  detail: MediaAsset | null;
  headingId: string;
}

function Caption({ children }: { children: string }) {
  return <figcaption className="mt-3 text-micro text-muted-foreground">{children}</figcaption>;
}

/**
 * Campaign spread, set like a magazine double page: a sticky column of type
 * beside a lead look and a smaller, lower pair. "ink" flips the section's
 * semantic tokens, so everything inside — the outline button included — reads
 * paper on ink without bespoke colours.
 */
export function CollectionSpread({ block, lead, supporting, detail, headingId }: CollectionSpreadProps) {
  const { eyebrow, title, body, cta } = block;
  const hasSecondary = Boolean(supporting || detail);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(block.theme === "ink" && "theme-ink", "py-24 md:py-32 xl:py-40")}
    >
      <Container className="grid grid-cols-1 gap-y-14 lg:grid-cols-12 lg:items-start lg:gap-x-8">
        <Reveal className="lg:sticky lg:top-[calc(var(--header-height)+3rem)] lg:col-span-4 lg:pr-4">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="h-px w-10 shrink-0 bg-border-strong" />
            <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
          </div>
          {/* Eased back at lg–xl, where a single long word would outgrow four columns. */}
          <h2
            id={headingId}
            className="mt-6 font-display text-display-xl hyphens-auto md:mt-8 lg:text-display-lg 2xl:text-display-xl"
          >
            <Emphasis text={title} />
          </h2>
          <p className="mt-6 max-w-md text-body text-muted-foreground md:mt-8">{body}</p>
          <Button variant="outline" arrow asChild className="mt-10 md:mt-12">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </Reveal>

        <Reveal
          delay={0.1}
          className={hasSecondary ? "lg:col-span-5 lg:col-start-5" : "lg:col-span-7 lg:col-start-6"}
        >
          <figure>
            <MediaImage
              image={lead}
              ratio="4/5"
              sizes={hasSecondary ? "(min-width: 1024px) 38vw, 100vw" : "(min-width: 1024px) 55vw, 100vw"}
            />
            <Caption>Look 01</Caption>
          </figure>
        </Reveal>

        {hasSecondary ? (
          // Side by side on small screens; a descending column beside the lead from lg.
          <div className="grid grid-cols-2 items-end gap-x-3 sm:gap-x-6 lg:col-span-3 lg:col-start-10 lg:mt-32 lg:block">
            {supporting ? (
              <Reveal delay={0.2}>
                <figure>
                  <MediaImage image={supporting} ratio="3/4" sizes="(min-width: 1024px) 22vw, 50vw" />
                  <Caption>Look 02</Caption>
                </figure>
              </Reveal>
            ) : null}
            {detail ? (
              <Reveal delay={0.1} className="lg:mt-10 xl:mt-14">
                <figure>
                  <MediaImage image={detail} ratio="1/1" sizes="(min-width: 1024px) 22vw, 50vw" />
                  <Caption>Detail</Caption>
                </figure>
              </Reveal>
            ) : null}
          </div>
        ) : null}
      </Container>
    </section>
  );
}
