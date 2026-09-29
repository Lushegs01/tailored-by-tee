import "server-only";

import type { AdminNavCounts } from "@/components/admin/admin-nav-config";
import { getDb, isDatabaseConfigured } from "@/lib/db";

/*
 * The small numbers beside "Orders" and "Reviews" in the admin navigation: one
 * cheap query (two indexed counts), run once per full render of the admin shell.
 * The shell re-renders after any admin server action that revalidates, and on a
 * refresh; plain navigation between admin pages keeps the counts it has.
 */

/** Paid orders not yet shipped, and reviews waiting for approval. Null when they can't be read. */
export async function getAdminNavCounts(): Promise<AdminNavCounts | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await getDb().$queryRaw<{ ordersToFulfil: number; reviewsPending: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "Order" WHERE "status" IN ('PAID', 'PROCESSING')) AS "ordersToFulfil",
        (SELECT COUNT(*)::int FROM "Review" WHERE "status" = 'PENDING') AS "reviewsPending"`;
    const row = rows[0];
    if (!row) return null;
    return { ordersToFulfil: Number(row.ordersToFulfil) || 0, reviewsPending: Number(row.reviewsPending) || 0 };
  } catch (error) {
    console.error("[admin] could not read navigation counts", error instanceof Error ? error.message : error);
    return null;
  }
}
