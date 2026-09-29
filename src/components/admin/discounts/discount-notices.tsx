import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/ui";
import { getCatalogSource } from "@/lib/catalog/sources";
import { cn } from "@/lib/utils";

/*
 * What the discount pages say when codes can't be kept or won't be used.
 */

const SETTINGS_SERVICES = "/admin/settings#services";

/** No DATABASE_URL: codes live in the database, so there is nothing to show or save. */
export function NoDatabaseNotice() {
  return (
    <div className="mt-6 border bg-background-raised">
      <AdminEmptyState
        as="h2"
        title="The database isn’t connected"
        body="Discount codes are kept in the database. Once it’s connected, you can create and manage them here."
        action={
          <Link href={SETTINGS_SERVICES} className="text-body-sm">
            <span className="link-underline-static pb-0.5">See connected services</span>
          </Link>
        }
      />
    </div>
  );
}

/**
 * The shop is reading its built-in sample catalogue (CATALOG_SOURCE=seed) while a
 * database is connected: checkout then looks up no codes at all
 * (lib/commerce/coupons.ts), so say so rather than let the owner wonder why a
 * code is refused.
 */
export function CheckoutIgnoresCodesNotice({ className }: { className?: string }) {
  if (getCatalogSource() === "database") return null;
  return (
    <p role="note" className={cn("border border-accent-brand/60 bg-accent-brand/5 px-4 py-3 text-body-sm", className)}>
      Checkout isn’t accepting discount codes at the moment: the shop is running on its built-in sample catalogue
      rather than the database. Codes you set up here start working as soon as it reads from the database.{" "}
      <Link href={SETTINGS_SERVICES} className="whitespace-nowrap">
        <span className="link-underline-static pb-0.5">Connected services</span>
      </Link>
    </p>
  );
}
