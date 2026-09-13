"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { Sheet } from "@/components/ui/sheet";

import { SearchPanel } from "./search-panel";
import { useSearch } from "./search-provider";

/**
 * Command-style search overlay: a full-width sheet dropping from the top.
 * Open state lives in <SearchProvider> (header button, ⌘K / Ctrl K, "/").
 */
export function SearchOverlay() {
  const { isOpen, setOpen, close } = useSearch();
  const pathname = usePathname();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Any route change (a picked result, back/forward) dismisses the overlay.
  const closeOnNavigation = React.useEffectEvent(() => {
    if (isOpen) close();
  });
  React.useEffect(() => {
    closeOnNavigation();
  }, [pathname]);

  function handleOpenAutoFocus(event: Event) {
    const input = inputRef.current;
    if (!input) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={setOpen}
      side="top"
      bare
      title="Search"
      description="Search pieces, categories and collections."
      onOpenAutoFocus={handleOpenAutoFocus}
      className="h-dvh md:h-auto"
    >
      <SearchPanel inputRef={inputRef} />
    </Sheet>
  );
}
