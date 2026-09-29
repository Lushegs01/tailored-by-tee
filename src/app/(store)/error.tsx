"use client";

import { useEffect } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { TextLink } from "@/components/ui/text-link";

interface RouteErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment (Next 16's preferred recovery). */
  retry: () => void;
}

/** Segment error boundary. Header and footer stay in place around it. */
export default function RouteError({ error, retry }: RouteErrorProps) {
  useEffect(() => {
    // Console only for now — wire to an error-reporting service before launch.
    console.error(error);
  }, [error]);

  return (
    <Container className="py-20 md:py-28 xl:py-36">
      <EmptyState
        as="h1"
        eyebrow="Error"
        title="Something came *undone.*"
        body="An unexpected error interrupted this page. You can try again, or return to the homepage."
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
    </Container>
  );
}
