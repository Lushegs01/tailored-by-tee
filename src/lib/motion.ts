/**
 * Motion vocabulary. Keep amplitudes low and durations unhurried:
 * the interface should feel settled, never busy.
 */
export const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

export const DURATION = {
  fast: 0.3,
  base: 0.6,
  slow: 0.9,
  drawer: 0.55,
} as const;

export const STAGGER = 0.07;
