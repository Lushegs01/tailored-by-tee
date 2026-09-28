"use client";

import { revokeAdminAccess } from "@/app/admin/settings/actions";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";
import { Button } from "@/components/ui/button";

import { useTeamFeedback } from "./team-feedback";

/**
 * "Remove access" for one admin, behind a destructive confirmation. The server
 * refuses your own access and the last admin's, whatever the page shows.
 */
export function RevokeAdminButton({ userId, email }: { userId: string; email: string }) {
  const report = useTeamFeedback();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" className="relative z-10 -mx-2 h-9 px-2 text-danger hover:bg-danger/10">
          Remove access<span className="sr-only"> for {email}</span>
        </Button>
      }
      tone="destructive"
      title="Remove admin access?"
      description={email}
      confirmLabel="Remove access"
      pendingLabel="Removing…"
      action={() => revokeAdminAccess({ userId })}
      onSuccess={(result) => report(result.message ?? `${result.data.email} no longer has admin access.`)}
    >
      <p>They lose access to this admin area straight away, on their next click, even on a page they already have open.</p>
      <p>Their customer account, orders and wishlist stay as they are. You can give them access again at any time.</p>
    </ConfirmDialog>
  );
}
