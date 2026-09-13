"use client";

import type { ReactNode } from "react";
import * as m from "motion/react-m";

import { DURATION, EASE_EDITORIAL } from "@/lib/motion";

/**
 * Mount-time fade for hero copy, timed to follow the headline's line reveal.
 * Deliberately not scroll-driven: the hero is always in view on arrival.
 */
export function HeroFade({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL, delay }}
    >
      {children}
    </m.div>
  );
}
