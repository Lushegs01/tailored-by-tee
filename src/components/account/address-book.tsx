"use client";

import * as React from "react";

import { makeDefaultAddress, removeAddress } from "@/app/account/(member)/addresses/actions";
import { EmptyState } from "@/components/feedback/empty-state";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import type { SavedAddress } from "@/lib/account/addresses";
import { cn } from "@/lib/utils";

import { AddressCard, addressCardId, addressName, addressSummary } from "./address-card";
import { ADDRESS_FIRST_FIELD_ID, AddressForm } from "./address-form";

export interface AddressBookProps {
  /** From the server: default first, then most recently updated. Refreshed after every change. */
  addresses: SavedAddress[];
  maxAddresses: number;
  /** Prefills for a new address, from the profile. */
  defaults: { fullName: string; phone: string };
  className?: string;
}

interface EditorState {
  open: boolean;
  /** Kept while the sheet animates closed, so its content doesn't blank out. */
  target: SavedAddress | null;
  isFirst: boolean;
  /** Fresh form state on every opening. */
  key: number;
}

type Notice = { id: number; tone: "success" | "error"; text: string };

/**
 * After a change removes the control that had focus (a deleted card, the empty
 * state's button, a "Set as default" that no longer applies), move focus to a
 * sensible place instead of leaving it on the page body. Waits for any dialog to
 * finish closing; if Radix restores focus to a trigger that still exists, that wins.
 */
function refocusIfLost(target: () => HTMLElement | null, settled: () => boolean = () => true) {
  const deadline = performance.now() + 2500;
  const tick = () => {
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (lost && settled() && !document.querySelector('[role="dialog"]')) {
      target()?.focus();
      return;
    }
    if (performance.now() < deadline) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function AddressBook({ addresses, maxAddresses, defaults, className }: AddressBookProps) {
  const [editor, setEditor] = React.useState<EditorState>({ open: false, target: null, isFirst: false, key: 0 });
  const [deleteState, setDeleteState] = React.useState<{ open: boolean; target: SavedAddress | null }>({
    open: false,
    target: null,
  });
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [defaultingId, setDefaultingId] = React.useState<string | null>(null);
  const [deleting, startDeleting] = React.useTransition();
  const [defaulting, startDefaulting] = React.useTransition();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const noticeCount = React.useRef(0);
  const limitId = React.useId();

  const count = addresses.length;
  const atLimit = count >= maxAddresses;
  const busy = deleting || defaulting;

  function announce(tone: Notice["tone"], text: string) {
    noticeCount.current += 1;
    setNotice({ id: noticeCount.current, tone, text });
  }

  function openEditor(target: SavedAddress | null) {
    if (busy || (!target && atLimit)) return;
    setNotice(null);
    setEditor((current) => ({ open: true, target, isFirst: !target && count === 0, key: current.key + 1 }));
  }

  function handleSaved(message: string) {
    setEditor((current) => ({ ...current, open: false }));
    announce("success", message);
    refocusIfLost(() => headingRef.current);
  }

  function askDelete(target: SavedAddress) {
    if (busy) return;
    setNotice(null);
    setDeleteError(null);
    setDeleteState({ open: true, target });
  }

  function confirmDelete() {
    const target = deleteState.target;
    if (!target || deleting) return;
    setDeleteError(null);

    startDeleting(async () => {
      const result = await removeAddress({ id: target.id });
      if (!result.ok && result.code !== "not_found") {
        setDeleteError(result.message);
        return;
      }
      setDeleteState((current) => ({ ...current, open: false }));
      announce(result.ok ? "success" : "error", result.ok ? `${addressName(target)} deleted.` : result.message);
      refocusIfLost(() => headingRef.current);
    });
  }

  function makeDefault(target: SavedAddress) {
    if (busy) return;
    setNotice(null);
    setDefaultingId(target.id);

    startDefaulting(async () => {
      const result = await makeDefaultAddress({ id: target.id });
      setDefaultingId(null);
      if (!result.ok) {
        announce("error", result.message);
        return;
      }
      announce("success", `${addressName(target)} is now your default address.`);
      // The card moves to the top and loses its "Set as default" button; keep focus on the card.
      const card = () => document.getElementById(addressCardId(target.id));
      refocusIfLost(card, () => card()?.dataset.default === "true");
    });
  }

  const deleteTarget = deleteState.target;
  // The list is default-first, then most recently updated: the next one along is the successor.
  const successor = deleteTarget?.isDefault ? addresses.find((address) => address.id !== deleteTarget.id) : undefined;

  return (
    <section aria-labelledby="saved-addresses-heading" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b pb-4">
        <h2 id="saved-addresses-heading" ref={headingRef} tabIndex={-1} className="text-label outline-none">
          Saved addresses <span className="tabular-nums text-muted-foreground">({count})</span>
        </h2>
        {count > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEditor(null)}
            aria-disabled={atLimit || busy || undefined}
            aria-describedby={atLimit ? limitId : undefined}
          >
            Add an address
          </Button>
        ) : null}
      </div>

      {atLimit ? (
        <p id={limitId} className="mt-4 text-caption text-muted-foreground">
          You&rsquo;ve saved {maxAddresses} addresses, the most an account keeps. Delete one to add another.
        </p>
      ) : null}

      <div role="status" aria-live="polite" aria-atomic="true">
        {notice?.tone === "success" ? (
          <p key={notice.id} className="mt-6 flex items-start gap-3 border px-4 py-3 text-body-sm">
            <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-success" />
            <span>{notice.text}</span>
          </p>
        ) : null}
      </div>
      {notice?.tone === "error" ? (
        <p key={notice.id} role="alert" className="mt-6 border border-danger/40 px-4 py-3 text-body-sm">
          {notice.text}
        </p>
      ) : null}

      {count === 0 ? (
        <EmptyState
          as="h3"
          align="start"
          size="sm"
          className="mt-10"
          title="No saved addresses *yet.*"
          body="Save a delivery address once and checkout fills it in for you in one tap."
          actions={<Button onClick={() => openEditor(null)}>Add an address</Button>}
        />
      ) : (
        <ul aria-busy={busy || undefined} className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              busy={busy}
              settingDefault={defaultingId === address.id}
              onEdit={() => openEditor(address)}
              onDelete={() => askDelete(address)}
              onMakeDefault={() => makeDefault(address)}
            />
          ))}
        </ul>
      )}

      <Sheet
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        title={editor.target ? "Edit address" : "Add an address"}
        description="Saved addresses are filled in for you at checkout."
        bodyClassName="px-6 pt-8 pb-10"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(ADDRESS_FIRST_FIELD_ID)?.focus();
        }}
      >
        <AddressForm
          key={editor.key}
          address={editor.target}
          defaults={defaults}
          isFirst={editor.isFirst}
          onSaved={handleSaved}
          onCancel={() => setEditor((current) => ({ ...current, open: false }))}
        />
      </Sheet>

      <Dialog
        open={deleteState.open}
        onOpenChange={(open) => {
          // Stay open while the delete is in flight, so its result has somewhere to land.
          if (!deleting) setDeleteState((current) => ({ ...current, open }));
        }}
        title="Delete this address?"
        description={deleteTarget ? addressSummary(deleteTarget) : undefined}
      >
        {successor ? (
          <p className="text-body-sm text-muted-foreground">
            It&rsquo;s your default, so {addressName(successor)} will become your default instead.
          </p>
        ) : (
          <p className="text-body-sm text-muted-foreground">You can add it again at any time.</p>
        )}
        {deleteError ? (
          <p role="alert" className="mt-4 border border-danger/40 px-4 py-3 text-body-sm">
            {deleteError}
          </p>
        ) : null}
        <div className={cn("mt-8 flex flex-col gap-3 sm:flex-row")}>
          <Button onClick={confirmDelete} disabled={deleting} aria-busy={deleting || undefined}>
            {deleting ? "Deleting…" : "Delete address"}
          </Button>
          <Button
            variant="outline"
            disabled={deleting}
            onClick={() => setDeleteState((current) => ({ ...current, open: false }))}
          >
            Keep it
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
