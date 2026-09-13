"use client";

import * as React from "react";

export interface SearchContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

const SearchContext = React.createContext<SearchContextValue | null>(null);

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Owns the search overlay's open state and the global ⌘K / Ctrl K / "/" shortcuts. */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !isTypingTarget(event.target);
      if (commandK || slash) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = React.useMemo<SearchContextValue>(
    () => ({ isOpen, setOpen, open: () => setOpen(true), close: () => setOpen(false) }),
    [isOpen],
  );

  return <SearchContext value={value}>{children}</SearchContext>;
}

export function useSearch() {
  const context = React.useContext(SearchContext);
  if (!context) throw new Error("useSearch must be used within <SearchProvider>");
  return context;
}
