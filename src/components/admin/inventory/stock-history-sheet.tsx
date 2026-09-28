"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadStockHistory } from "@/app/admin/inventory/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminActionResult } from "@/lib/admin/auth";
import { formatAdminDateTime } from "@/lib/admin/format";
import {
  formatStockDelta,
  historyActorLabel,
  inventoryReasonLabel,
  variantLabel,
  type StockActionTarget,
  type StockHistoryEntry,
  type StockHistoryPage,
} from "@/lib/admin/stock-state";
import { cn } from "@/lib/utils";

import { CurrentLevels } from "./stock-form-parts";

const LOAD_FAILED = "The history couldn’t be loaded. Check your connection and try again.";

/** A variant's stock movements, newest first, in a sheet from the right. Loads each time it opens. */
export function StockHistorySheet({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StockActionTarget;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Stock history"
      description={`Every change to the stock of ${variantLabel(target)}, newest first.`}
      className="max-w-[32rem]"
    >
      <HistoryBody target={target} />
    </Sheet>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: StockHistoryEntry[]; nextCursor: string | null };

async function fetchPage(
  variantId: string,
  before: string | null,
): Promise<AdminActionResult<StockHistoryPage>> {
  try {
    return await loadStockHistory({ variantId, before });
  } catch {
    return { ok: false, message: LOAD_FAILED };
  }
}

/** Mounted only while the sheet is open, so every opening starts from the latest history. */
function HistoryBody({ target }: { target: StockActionTarget }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [olderState, setOlderState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  useEffect(() => {
    let current = true;
    fetchPage(target.variantId, null).then((result) => {
      if (!current) return;
      setState(
        result.ok
          ? { status: "ready", entries: result.data.entries, nextCursor: result.data.nextCursor }
          : { status: "error", message: result.message },
      );
    });
    return () => {
      current = false;
    };
  }, [target.variantId, attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  async function loadOlder() {
    if (state.status !== "ready" || !state.nextCursor || olderState.loading) return;
    setOlderState({ loading: true, error: null });
    const result = await fetchPage(target.variantId, state.nextCursor);
    if (!result.ok) {
      setOlderState({ loading: false, error: result.message });
      return;
    }
    setOlderState({ loading: false, error: null });
    setState((previous) =>
      previous.status === "ready"
        ? {
            status: "ready",
            entries: [
              ...previous.entries,
              ...result.data.entries.filter(
                (entry) => !previous.entries.some((seen) => seen.id === entry.id),
              ),
            ],
            nextCursor: result.data.nextCursor,
          }
        : previous,
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-3 border-b px-6 py-5">
        <div>
          <p className="text-body-sm font-medium">{variantLabel(target)}</p>
          <p className="mt-0.5 text-caption break-all text-muted-foreground">{target.sku}</p>
        </div>
        <CurrentLevels level={target} />
      </div>

      <p role="status" className="sr-only">
        {state.status === "ready"
          ? `${state.entries.length} ${state.entries.length === 1 ? "change" : "changes"} shown${state.nextCursor ? ", more available" : ""}.`
          : ""}
      </p>
      <div aria-busy={state.status === "loading" || undefined} className="flex-1">
        {state.status === "loading" ? (
          <HistorySkeleton />
        ) : state.status === "error" ? (
          <div className="px-6 py-8">
            <p role="alert" className="text-body-sm text-danger">
              {state.message}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : state.entries.length === 0 ? (
          <p className="px-6 py-8 text-body-sm text-muted-foreground">
            No stock changes have been recorded yet.
          </p>
        ) : (
          <>
            <h3 className="sr-only">Changes, newest first</h3>
            <ol className="divide-y">
              {state.entries.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} />
              ))}
            </ol>
            {state.nextCursor ? (
              <div className="border-t px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={olderState.loading}
                  aria-busy={olderState.loading || undefined}
                  onClick={loadOlder}
                >
                  {olderState.loading ? "Loading…" : "Show older changes"}
                </Button>
                {olderState.error ? (
                  <p role="alert" className="mt-3 text-caption text-danger">
                    {olderState.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="border-t px-6 py-4 text-caption text-muted-foreground">
                That’s the full history.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeltaFigure({ label, delta, strong }: { label: string; delta: number; strong?: boolean }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        strong ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="text-caption font-normal text-muted-foreground">{label} </span>
      {formatStockDelta(delta)}
    </span>
  );
}

function HistoryItem({ entry }: { entry: StockHistoryEntry }) {
  const showOnHand = entry.onHandDelta !== 0 || entry.reservedDelta === 0;
  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-body-sm font-medium">{inventoryReasonLabel(entry.reason)}</p>
        <p className="flex flex-wrap gap-x-3 text-body-sm">
          {showOnHand ? <DeltaFigure label="On hand" delta={entry.onHandDelta} strong /> : null}
          {entry.reservedDelta !== 0 ? <DeltaFigure label="Held" delta={entry.reservedDelta} /> : null}
        </p>
      </div>
      <p className="mt-1 text-caption text-muted-foreground">
        <time dateTime={entry.createdAt}>{formatAdminDateTime(entry.createdAt)}</time>
        <span aria-hidden="true"> · </span>
        <span className="sr-only">, by </span>
        <span className="break-all">{historyActorLabel(entry)}</span>
      </p>
      {entry.note ? <p className="mt-2 text-body-sm break-words">{entry.note}</p> : null}
      {entry.order ? (
        <p className="mt-2 text-body-sm">
          <Link
            href={`/admin/orders/${encodeURIComponent(entry.order.number)}`}
            className="link-underline-static pb-0.5 tabular-nums"
          >
            Order {entry.order.number}
          </Link>
        </p>
      ) : null}
    </li>
  );
}

function HistorySkeleton() {
  return (
    <div role="status" className="divide-y">
      <span className="sr-only">Loading the history</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} aria-hidden="true" className="space-y-2 px-6 py-4">
          <div className="flex justify-between gap-4">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-2.5 w-48 max-w-full" />
        </div>
      ))}
    </div>
  );
}
