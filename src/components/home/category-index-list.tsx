"use client";

import Link from "next/link";
import { useState, type FocusEvent, type ReactNode } from "react";

import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { pluralize } from "@/lib/format";

export interface CategoryIndexLink {
  slug: string;
  name: string;
  href: string;
  count: number;
}

export interface CategoryIndexListProps {
  entries: CategoryIndexLink[];
  /** Server-rendered image (or fallback panel) for each entry, in the same order. */
  media: ReactNode[];
  listClassName?: string;
  mediaClassName?: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Desktop category index: large serif names beside one sticky image. Pointing at
 * or focusing a name brings its photograph forward and quietens the other names.
 * Only this hover state lives on the client — the images arrive server-rendered.
 */
export function CategoryIndexList({ entries, media, listClassName, mediaClassName }: CategoryIndexListProps) {
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);

  function select(index: number) {
    setActive(index);
    setEngaged(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setEngaged(false);
  }

  const current = entries[active];

  return (
    <>
      <div className={listClassName} onMouseLeave={() => setEngaged(false)} onBlur={handleBlur}>
        <RevealGroup as="ul">
          {entries.map((entry, index) => (
            <RevealItem as="li" key={entry.slug}>
              <Link
                href={entry.href}
                onMouseEnter={() => select(index)}
                onFocus={() => select(index)}
                className={`inline-flex items-start gap-2 py-1 font-display text-display-md transition-colors duration-500 ease-editorial ${
                  engaged && index !== active ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                <span>{entry.name}</span>
                <sup className="static pt-[0.9em] font-sans text-micro tracking-normal tabular-nums">
                  <span aria-hidden="true">{entry.count}</span>
                  <span className="sr-only">, {pluralize(entry.count, "piece")}</span>
                </sup>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>

      {/* Illustrative only — the names above carry the links. */}
      <div aria-hidden="true" className={mediaClassName}>
        <Reveal delay={0.1}>
          <div className="relative aspect-3/4 overflow-hidden bg-surface">
            {media.map((node, index) => (
              <div
                key={entries[index]?.slug ?? index}
                className={`absolute inset-0 transition-[opacity,scale] duration-1000 ease-editorial ${
                  index === active ? "scale-100 opacity-100" : "scale-[1.03] opacity-0"
                }`}
              >
                {node}
              </div>
            ))}
          </div>
          {current ? (
            <p className="mt-4 flex justify-between text-micro text-muted-foreground">
              <span>{current.name}</span>
              <span className="tabular-nums">
                {pad(active + 1)} / {pad(entries.length)}
              </span>
            </p>
          ) : null}
        </Reveal>
      </div>
    </>
  );
}
