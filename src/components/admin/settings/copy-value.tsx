"use client";

import { useEffect, useId, useRef, useState } from "react";

import { adminControlClassName } from "@/components/admin/ui/field-styles";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A public value to paste into another service (a webhook or redirect address),
 * shown in a read-only box with a Copy button. Never use it for a secret. When the
 * browser won't copy (older phones, blocked permission), the value is selected so
 * it can be copied by hand, and the page says so.
 */
export function CopyValue({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      timer.current = window.setTimeout(() => setState("idle"), 4000);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setState("failed");
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="block text-caption text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5 flex min-w-0 gap-2">
        <Input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          spellCheck={false}
          aria-describedby={hint ? hintId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(adminControlClassName, "min-w-0 flex-1 font-mono text-caption")}
        />
        <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0 px-4">
          {state === "copied" ? (
            <>
              <CheckIcon aria-hidden="true" className="text-base" />
              Copied
            </>
          ) : (
            <>
              Copy<span className="sr-only"> {label.toLowerCase()}</span>
            </>
          )}
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className={cn("text-caption", state === "failed" ? "mt-1.5 text-danger" : "sr-only")}>
        {state === "copied"
          ? `${label} copied.`
          : state === "failed"
            ? "Your browser didn’t allow copying. The address is selected: copy it with your keyboard, or press and hold on a phone."
            : ""}
      </p>
    </div>
  );
}
