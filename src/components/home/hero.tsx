import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { getImageProps } from "next/image";

import { ArrowUpRightIcon } from "@/components/icons";
import { LineReveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Emphasis } from "@/components/ui/emphasis";
import type { HeroBlock } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";

import { HeroFade } from "./hero-fade";

export interface HeroProps {
  block: HeroBlock;
  /** Landscape art (16:10). Null sets the hero on ink without photography. */
  image: MediaAsset | null;
  /** Portrait crop (3:4) for small screens. */
  mobileImage: MediaAsset | null;
  headingId: string;
}

/** Splits a headline at its *emphasis* so the italic phrase sets on its own line. */
function headlineLines(text: string) {
  return text
    .split(/(\*[^*]+\*)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Campaign opener and the page's LCP. The copy animates on mount (never on
 * scroll) and the photograph settles through CSS, so nothing waits on a viewport
 * observer before the first paint.
 */
export function Hero({ block, image, mobileImage, headingId }: HeroProps) {
  const { eyebrow, headline, body, primaryCta, secondaryCta, caption } = block;
  const [captionLead, captionTitle] = caption ? caption.label.split(/\s+[—–-]\s+/) : [];

  const lines = headlineLines(headline).map((line) => (
    // The trailing space keeps words apart in the accessible name across block lines.
    <Fragment key={line}>
      <Emphasis text={line} />{" "}
    </Fragment>
  ));

  return (
    <section
      aria-labelledby={headingId}
      className="relative isolate flex h-[100svh] max-h-[70rem] min-h-[40rem] flex-col justify-end overflow-hidden bg-ink text-paper [--ring:var(--paper)]"
    >
      {image ? (
        <div
          className="absolute inset-0 animate-hero-settle [background-color:var(--hero-ground-sm)] md:[background-color:var(--hero-ground)]"
          style={
            {
              "--hero-ground": image.color,
              "--hero-ground-sm": (mobileImage ?? image).color,
            } as CSSProperties
          }
        >
          <HeroPicture image={image} mobileImage={mobileImage} />
        </div>
      ) : null}

      {/* Legibility scrims: header at the top, copy at the bottom-left. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[30%] bg-linear-to-b from-ink/35 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-linear-to-t from-ink/65 via-ink/25 via-40% to-transparent md:h-1/2 md:from-ink/40 md:via-ink/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-linear-to-tr from-ink/40 via-transparent via-55% to-transparent md:block"
      />

      <Container className="relative pb-10 pt-32 md:pb-14 xl:pb-20">
        <div className="max-w-[60rem]">
          <HeroFade delay={0.1}>
            <p className="mb-5 text-eyebrow text-paper/80 md:mb-7">{eyebrow}</p>
          </HeroFade>

          <h1 id={headingId} className="font-display text-display-xl">
            <LineReveal lines={lines} delay={0.2} stagger={0.1} />
          </h1>

          <HeroFade delay={0.7}>
            <p className="mt-6 max-w-md text-body text-paper/85 md:mt-8">{body}</p>
          </HeroFade>

          <HeroFade delay={0.85} className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 md:mt-10">
            <Button variant="light" arrow asChild>
              <Link href={primaryCta.href}>{primaryCta.label}</Link>
            </Button>
            {secondaryCta ? (
              <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center text-label text-paper">
                <span className="link-underline-static pb-1">{secondaryCta.label}</span>
              </Link>
            ) : null}
          </HeroFade>
        </div>

        {/* Campaign credit. From lg only — below that it would crowd the calls to action. */}
        {caption ? (
          <HeroFade delay={1} className="absolute bottom-14 right-(--gutter) hidden lg:block xl:bottom-20">
            <Link
              href={caption.href}
              aria-label={caption.label}
              className="group/caption flex min-h-11 items-end gap-3 text-paper"
            >
              <span className="flex flex-col items-end gap-1.5 text-right">
                {captionTitle ? <span className="text-eyebrow text-paper/75">{captionLead}</span> : null}
                <span className="link-underline pb-1 text-label">{captionTitle ?? captionLead}</span>
              </span>
              <ArrowUpRightIcon className="mb-1.5 text-base transition-[translate] duration-500 ease-editorial group-hover/caption:-translate-y-0.5 group-hover/caption:translate-x-0.5" />
            </Link>
          </HeroFade>
        ) : null}
      </Container>
    </section>
  );
}

/**
 * Art-directed <picture>: landscape from md, portrait below. The browser picks one
 * source, so only one file downloads — at high priority, eagerly, with no preload
 * link that would fetch the wrong crop.
 */
function HeroPicture({ image, mobileImage }: { image: MediaAsset; mobileImage: MediaAsset | null }) {
  const shared = {
    alt: image.alt,
    sizes: "100vw",
    quality: 85,
    loading: "eager",
    fetchPriority: "high",
  } as const;

  const desktop = getImageProps({ ...shared, src: image.src, width: image.width, height: image.height }).props;
  const small = mobileImage
    ? getImageProps({ ...shared, src: mobileImage.src, width: mobileImage.width, height: mobileImage.height })
        .props
    : desktop;

  return (
    <picture>
      {mobileImage ? <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes="100vw" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- art direction needs a native <picture>; props come from getImageProps */}
      <img {...small} alt={image.alt} className="absolute inset-0 size-full object-cover" />
    </picture>
  );
}
