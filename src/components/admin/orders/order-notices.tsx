import { Notice } from "@/components/admin/collections/notice";
import type { OrderLoad } from "@/lib/admin/orders";

/*
 * What the owner sees when the orders can't be read at all. Each one says what is
 * wrong in plain words and who can put it right — never a stack trace, and never
 * an empty page that looks like "no orders".
 */

type Reason = Extract<OrderLoad<unknown>, { ok: false }>["reason"];

export function OrdersUnavailable({ reason, className }: { reason: Reason; className?: string }) {
  if (reason === "not_configured") {
    return (
      <Notice tone="critical" title="The shop isn’t connected to its database" className={className}>
        <p>
          Orders are stored in the database, and there isn’t one set up yet. Your developer needs to add the
          connection details before anything can be shown here.
        </p>
      </Notice>
    );
  }

  if (reason === "needs_migration") {
    return (
      <Notice tone="warning" title="The database needs an update" className={className}>
        <p>
          Orders can’t be shown until the latest database changes are applied. Ask your developer to run{" "}
          <code className="font-mono text-caption">npm run db:deploy</code>, then reload this page.
        </p>
      </Notice>
    );
  }

  return (
    <Notice tone="critical" title="Orders couldn’t be loaded" className={className}>
      <p>
        Something went wrong reading the orders. Reload the page; if it keeps happening, your developer can check the
        server logs.
      </p>
    </Notice>
  );
}
