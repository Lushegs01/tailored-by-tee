"use client";

import { useRouter } from "next/navigation";

import { deleteDiscount } from "@/app/admin/discounts/actions";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DISCOUNTS_PATH } from "@/lib/admin/discount-schema";

/**
 * "Delete discount", behind a destructive confirmation. Only offered for codes no
 * order has used; the server checks again under a lock, and refuses otherwise.
 * On success it goes back to the list, which confirms the deletion.
 */
export function DeleteDiscountButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm" className="border-danger/60 text-danger hover:border-danger hover:bg-danger hover:text-paper">
          Delete discount<span className="sr-only"> {code}</span>
        </Button>
      }
      tone="destructive"
      title={`Delete ${code}?`}
      description="This can’t be undone."
      confirmLabel="Delete discount"
      pendingLabel="Deleting…"
      action={() => deleteDiscount({ id })}
      onSuccess={() => router.replace(`${DISCOUNTS_PATH}?deleted=${encodeURIComponent(code)}`)}
    >
      <p>The code stops working straight away and is removed from the list. No order has used it, so no order refers to it.</p>
      <p>To stop it for now and keep it for later, switch it off instead.</p>
    </ConfirmDialog>
  );
}
