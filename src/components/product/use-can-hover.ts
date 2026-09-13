"use client";

import { useSyncExternalStore } from "react";

/** Same query Tailwind wraps its hover variants in, so JS and CSS always agree. */
const QUERY = "(hover: hover)";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * True when the primary input can hover (mouse, trackpad). False on the server
 * and during hydration, so hover-only extras mount after the first paint.
 */
export function useCanHover() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
