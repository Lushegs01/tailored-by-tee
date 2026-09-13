"use client";

import * as React from "react";

/**
 * Polite screen-reader announcements for changes made out of view (bag, wishlist).
 * Repeating the same message still re-announces it: a trailing no-break space is
 * toggled so the text node always changes.
 */
export function useAnnouncer() {
  const [state, setState] = React.useState({ message: "", count: 0 });

  const announce = React.useCallback((message: string) => {
    setState((previous) => ({ message, count: previous.count + 1 }));
  }, []);

  const message = state.message && state.count % 2 === 0 ? `${state.message} ` : state.message;
  return { message, announce };
}

/**
 * Keep the explicit `aria-live` attribute: Radix dialogs hide the rest of the page
 * from assistive tech but deliberately leave `[aria-live]` nodes exposed, so
 * messages still land while the bag drawer is open.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
