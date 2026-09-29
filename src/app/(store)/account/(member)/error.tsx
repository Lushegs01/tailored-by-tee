"use client";

import { useEffect } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/text-link";
import { siteConfig } from "@/config/site";

interface AccountErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed page (Next 16's preferred recovery over reset). */
  retry: () => void;
}

/** Error boundary for account pages. The greeting and navigation stay in place around it. */
export default function AccountError({ error, retry }: AccountErrorProps) {
  useEffect(() => {
    // Console only for now — wire to an error-reporting service before launch.
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      as="h1"
      size="sm"
      align="start"
      className="border-t pt-6"
      title="This page didn’t *load.*"
      body={
        <p>
          Something interrupted this part of your account. Please try again — if it keeps happening, email{" "}
          <a href={`mailto:${siteConfig.contact.email}`} className="link-underline-static text-foreground">
            {siteConfig.contact.email}
          </a>
          .
        </p>
      }
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <TextLink href="/">Return home</TextLink>
        </>
      }
    >
      {error.digest ? (
        <p className="text-caption text-muted-foreground">
          Reference <span className="select-all tabular-nums">{error.digest}</span>
        </p>
      ) : null}
    </EmptyState>
  );
}
