"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

import { EASE_EDITORIAL } from "@/lib/motion";

/**
 * Loads Motion's DOM animation features once (≈15kb instead of the full bundle).
 * `strict` enforces the lightweight `m.*` components from "motion/react-m" —
 * importing `motion.*` inside the app will throw in development.
 * `reducedMotion="user"` drops transform animations for users who ask for less motion.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.7, ease: EASE_EDITORIAL }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
