"use client";

import { useEffect } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { fontVariables } from "@/lib/fonts";

import "./globals.css";

/*
 * Replaces the root layout when it fails, so it brings its own document, styles
 * and fonts (the same shared font module as the layout).
 */
interface GlobalErrorProps {
  error: Error & { digest?: string };
}

export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-NG" className={fontVariables}>
      <body>
        <title>{`Something went wrong — ${siteConfig.name}`}</title>
        <div className="flex min-h-dvh flex-col">
          <header className="flex h-(--header-height) shrink-0 items-center justify-center border-b px-(--gutter)">
            {/* A full document load, not a client transition: the root layout itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" aria-label={`${siteConfig.name}, home`} className="inline-flex min-h-11 items-center">
              <Wordmark className="text-[15px]" />
            </a>
          </header>
          <main className="flex flex-1 items-center justify-center px-(--gutter) py-16">
            <EmptyState
              as="h1"
              title="Something came *undone.*"
              body="The site could not load just now. Reloading the page usually puts things right."
              actions={<Button onClick={() => window.location.reload()}>Reload page</Button>}
            >
              {error.digest ? (
                <p className="text-caption text-muted-foreground">
                  Reference <span className="select-all tabular-nums">{error.digest}</span>
                </p>
              ) : null}
            </EmptyState>
          </main>
        </div>
      </body>
    </html>
  );
}
