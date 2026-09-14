"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * False during server rendering and hydration, true afterwards — without a
 * setState-in-effect. For UI that depends on browser-only state (the bag in
 * localStorage, a checkout draft in sessionStorage).
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
