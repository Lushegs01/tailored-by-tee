import { withAdminRoute } from "@/lib/admin/auth";
import { formatAdminDateTime } from "@/lib/admin/format";
import { getInventoryCategories, listInventoryForExport } from "@/lib/admin/inventory";
import { productStatusDisplay, stockDisplay } from "@/lib/admin/status";
import { parseInventoryListParams, toInventoryListQuery } from "@/lib/admin/stock-state";

import { toCsv } from "./csv";

/*
 * GET /admin/inventory/export?…: the inventory list as a CSV file, with the same
 * search, filters and order as the page it was opened from (every page of it,
 * up to INVENTORY_EXPORT_LIMIT rows). Admins only: anyone else gets a plain 404.
 * Rate-limited, never cached, and every text cell is defused against formula
 * injection (see ./csv).
 */

const HEADER = [
  "Product",
  "Product status",
  "Category",
  "SKU",
  "Colour",
  "Size",
  "Variant switched on",
  "On hand",
  "Held for unpaid orders",
  "Available to sell",
  "Low-stock level",
  "Stock",
  "Paid, not yet shipped",
  "Stock last changed (Lagos time)",
] as const;

const lagosDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function GET(request: Request) {
  return withAdminRoute(
    request,
    "inventory.export",
    async () => {
      const params = parseInventoryListParams(new URL(request.url).searchParams);
      const categories = await getInventoryCategories();
      const query = toInventoryListQuery(
        params,
        categories.map((category) => category.slug),
      );
      const { rows, truncated } = await listInventoryForExport(query);

      const csv = toCsv(
        HEADER,
        rows.map((row) => [
          row.productName,
          productStatusDisplay(row.productStatus).label,
          row.categoryName,
          row.sku,
          row.colorName,
          row.sizeLabel,
          row.isActive,
          row.onHand,
          row.reserved,
          row.available,
          row.lowStockThreshold,
          stockDisplay(row).label,
          row.awaitingShipment,
          row.stockUpdatedAt ? formatAdminDateTime(row.stockUpdatedAt) : null,
        ]),
      );

      const filename = `tailored-by-tee-inventory-${lagosDay.format(new Date())}.csv`;
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
          ...(truncated ? { "X-Export-Truncated": "true" } : {}),
        },
      });
    },
    { limit: 20, windowMs: 60_000 },
  );
}
