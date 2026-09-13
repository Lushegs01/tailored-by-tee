"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { HEADER_HIDE_AFTER, HEADER_SCROLL_TOLERANCE, HEADER_SOLID_AFTER } from "./header-config";

export interface HeaderScrollState {
  /** Past HEADER_SOLID_AFTER: overlay headers turn solid and the announcement tucks away. */
  scrolled: boolean;
  /** Tucked above the viewport after scrolling down. Always false while locked. */
  hidden: boolean;
}

type Direction = "up" | "down" | null;

/**
 * Passive, rAF-throttled scroll tracking for the header. State only changes when a
 * threshold is crossed or the direction flips, so the header re-renders a handful
 * of times per scroll rather than every frame.
 *
 * `locked` keeps the header in view (a panel or drawer is open, or keyboard focus
 * is inside it) without re-subscribing the listener.
 */
export function useHeaderScroll(locked: boolean): HeaderScrollState {
  const [state, setState] = useState<HeaderScrollState>({ scrolled: false, hidden: false });

  const applyScroll = useEffectEvent((y: number, direction: Direction) => {
    setState((previous) => {
      const scrolled = y > HEADER_SOLID_AFTER;
      let hidden = previous.hidden;
      if (locked || y <= HEADER_HIDE_AFTER) hidden = false;
      else if (direction === "down") hidden = true;
      else if (direction === "up") hidden = false;

      return previous.scrolled === scrolled && previous.hidden === hidden ? previous : { scrolled, hidden };
    });
  });

  useEffect(() => {
    let frame = 0;
    // Direction is measured from the last point it changed, so slow scrolls still register.
    let anchorY = Math.max(0, window.scrollY);

    const measure = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY); // iOS overscroll reports negative values
      const delta = y - anchorY;
      let direction: Direction = null;
      if (Math.abs(delta) >= HEADER_SCROLL_TOLERANCE) {
        direction = delta > 0 ? "down" : "up";
        anchorY = y;
      }
      applyScroll(y, direction);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    // Pick up a restored scroll position (reload mid-page, back/forward).
    frame = window.requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return { scrolled: state.scrolled, hidden: state.hidden && !locked };
}
