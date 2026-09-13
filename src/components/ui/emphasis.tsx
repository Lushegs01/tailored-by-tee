import { Fragment } from "react";

/**
 * Renders content copy with *asterisk* emphasis as italic serif — the brand's one
 * typographic flourish. Lets editors style headlines without writing markup.
 */
export function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);

  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <em key={index} className="font-display italic">
            {part.slice(1, -1)}
          </em>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Plain-text version for metadata and aria labels. */
export function stripEmphasis(text: string) {
  return text.replace(/\*/g, "");
}
