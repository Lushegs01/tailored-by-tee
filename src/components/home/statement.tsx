import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import { TextLink } from "@/components/ui/text-link";
import type { StatementBlock } from "@/lib/content/types";

export interface StatementProps {
  block: StatementBlock;
  headingId: string;
}

/**
 * A single sentence set large, off-centre, with room around it — the page
 * exhales after the hero before the first products appear.
 */
export function Statement({ block, headingId }: StatementProps) {
  const { eyebrow, text, link } = block;

  return (
    <section aria-labelledby={headingId} className="pb-12 pt-24 md:pb-16 md:pt-36 xl:pb-20 xl:pt-48">
      <Container className="grid grid-cols-1 gap-y-8 md:grid-cols-12 md:gap-x-8">
        <Reveal className="md:col-span-3 md:pt-3 xl:pt-5">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="h-px w-10 shrink-0 bg-border-strong" />
            <h2 id={headingId} className="text-eyebrow text-muted-foreground">
              {eyebrow}
            </h2>
          </div>
        </Reveal>

        <div className="md:col-span-8 md:col-start-4">
          <Reveal delay={0.08}>
            <p className="font-display text-display-sm lg:text-display-md">
              <Emphasis text={text} />
            </p>
          </Reveal>
          {link ? (
            <Reveal delay={0.16} className="mt-10 md:mt-14">
              <TextLink href={link.href}>{link.label}</TextLink>
            </Reveal>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
