import "server-only";

import { refresh } from "next/cache";

/*
 * Showing an admin's own change straight away.
 *
 * Admin pages read the database on every request, but after a server action Next
 * only re-renders the page the admin is on when the action reports a change.
 * refreshStorefrontCatalog() (lib/admin/catalog) already does; an action that
 * changes nothing in the storefront's catalogue snapshot (an order's status or
 * tracking, a review's moderation, a discount, a customer) calls refreshAdminView()
 * instead, so the page and the navigation counts update in the same response.
 * Calling both is harmless. Not needed when the action ends in redirect().
 */

/** Server actions only (throws elsewhere): re-render the current admin page with fresh data. */
export function refreshAdminView(): void {
  refresh();
}
