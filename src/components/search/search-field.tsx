"use client";

import * as React from "react";

import { SearchIcon } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { SheetClose } from "@/components/ui/sheet";

import { MAX_QUERY_LENGTH } from "./search-config";

export interface SearchFieldProps {
  inputRef: React.Ref<HTMLInputElement>;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  /** ArrowDown from the input — move focus into the list below. */
  onArrowDown: () => void;
  /** id of the region the input drives. */
  controlsId: string;
}

const controlClass =
  "inline-flex h-11 shrink-0 items-center px-2 text-label transition-opacity duration-300 ease-editorial hover:opacity-60";

/**
 * The overlay's top row: a large, borderless serif input between a search glyph
 * and a text "Close". The hairline beneath turns ink while the input has focus —
 * that rule is the field's focus indicator.
 */
export function SearchField({
  inputRef,
  value,
  onValueChange,
  onSubmit,
  onClear,
  onArrowDown,
  controlsId,
}: SearchFieldProps) {
  const inputId = React.useId();
  const hintId = React.useId();

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onArrowDown();
    }
  }

  return (
    <div className="shrink-0 border-b border-border transition-colors duration-500 ease-editorial has-[input:focus]:border-foreground">
      <Container className="flex h-20 items-center gap-3 md:h-24 md:gap-5 xl:h-28">
        <SearchIcon className="shrink-0 text-[1.375rem] text-muted-foreground md:text-[1.625rem]" />
        <form
          role="search"
          action="/search"
          method="get"
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Search the collection
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="q"
            type="search"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the collection"
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            aria-controls={controlsId}
            aria-describedby={hintId}
            className="h-14 w-full min-w-0 appearance-none truncate bg-transparent font-display text-display-sm text-foreground outline-hidden placeholder:text-muted-foreground"
          />
          <span id={hintId} className="sr-only">
            Press Enter to see all results. Use the arrow keys to move through suggestions and results.
          </span>
        </form>
        {value ? (
          <button type="button" onClick={onClear} aria-label="Clear search" className={`${controlClass} text-muted-foreground`}>
            Clear
          </button>
        ) : null}
        <SheetClose asChild>
          <button type="button" className={`${controlClass} -mr-2 text-foreground`}>
            Close
          </button>
        </SheetClose>
      </Container>
    </div>
  );
}
