"use client";

import * as React from "react";
import * as m from "motion/react-m";
import type { Variants } from "motion/react";

import { DURATION, EASE_EDITORIAL, STAGGER } from "@/lib/motion";

/*
 * Scroll-entrance primitives. Never wrap the LCP element (hero image/headline)
 * in these — content starts at opacity 0 until it scrolls into view.
 */

const viewport = { once: true, amount: 0.15, margin: "0px 0px -10% 0px" } as const;

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Vertical travel in px. Keep it small. */
  y?: number;
}

/** Fade + slight rise when the element enters the viewport. */
export function Reveal({ children, className, delay = 0, y = 16 }: RevealProps) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport}
      transition={{ duration: DURATION.slow, ease: EASE_EDITORIAL, delay }}
    >
      {children}
    </m.div>
  );
}

const groupVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_EDITORIAL } },
};

/** Parent for staggered children (e.g. a product grid). Renders a <ul> when `as="ul"`. */
export function RevealGroup({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul";
}) {
  const Comp = as === "ul" ? m.ul : m.div;
  return (
    <Comp className={className} variants={groupVariants} initial="hidden" whileInView="show" viewport={viewport}>
      {children}
    </Comp>
  );
}

export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const Comp = as === "li" ? m.li : m.div;
  return (
    <Comp className={className} variants={itemVariants}>
      {children}
    </Comp>
  );
}

/**
 * Line-by-line masked reveal for editorial headlines. Each line rises from behind
 * an overflow mask on mount (not on scroll) — intended for the hero.
 */
export function LineReveal({
  lines,
  className,
  lineClassName,
  delay = 0.15,
  stagger = 0.09,
}: {
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <span className={className}>
      {lines.map((line, index) => (
        <span key={index} className="block overflow-hidden pb-[0.08em]">
          <m.span
            className={lineClassName ?? "block"}
            initial={{ y: "105%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 1.1, ease: EASE_EDITORIAL, delay: delay + index * stagger }}
          >
            {line}
          </m.span>
        </span>
      ))}
    </span>
  );
}
