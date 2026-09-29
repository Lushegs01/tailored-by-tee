import {
  deliveryLabel,
  deliveryZoneName,
  phoneForDisplay,
} from "@/components/admin/orders/order-copy";
import { parseOrderListParams, toOrderListQuery } from "@/components/admin/orders/order-list-params";
import { findState } from "@/config/nigeria";
import { withAdminRoute } from "@/lib/admin/auth";
import { formatAdminDateTime } from "@/lib/admin/format";
import { listOrdersForExport, ORDERS_EXPORT_LIMIT } from "@/lib/admin/orders";
import { orderStatusDisplay, paymentStatusDisplay } from "@/lib/admin/status";

import { toCsv } from "../../inventory/export/csv";

/*
 * GET /admin/orders/export?…: the orders list as a CSV file, with the same
 * search, filters and order as the page it was opened from — every page of it, up
 * to ORDERS_EXPORT_LIMIT rows. Admins only: anyone else gets a plain 404.
 * Rate-limited and never cached.
 *
 * Money is written as plain naira numbers (12500.5), not "₦12,500.50", so a
 * spreadsheet can add them up. Every text cell is defused against formula
 * injection by the shared CSV writer.
 */

const HEADER = [
  "Order",
  "Placed (Lagos time)",
  "Status",
  "Payment",
  "Test payment",
  "Demo order",
  "Customer",
  "Email",
  "Phone",
  "Lines",
  "Pieces",
  "Subtotal (₦)",
  "Discount (₦)",
  "Discount code",
  "Delivery (₦)",
  "Total (₦)",
  "Delivery method",
  "Delivery zone",
  "Delivery estimate",
  "Address line 1",
  "Address line 2",
  "City",
  "State",
  "Postcode",
  "Delivery notes",
  "Courier",
  "Tracking number",
  "Paid at",
  "Shipped at",
  "Delivered at",
  "Cancelled at",
  "Refunded at",
] as const;

const lagosDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Integer kobo as a plain number a spreadsheet can total: 1_250_050 → 12500.5. */
function naira(kobo: number): number {
  return kobo / 100;
}

function moment(value: Date | null): string | null {
  return value ? formatAdminDateTime(value) : null;
}

export async function GET(request: Request) {
  return withAdminRoute(
    request,
    "orders.export",
    async () => {
      const params = parseOrderListParams(new URL(request.url).searchParams);
      const { rows, truncated } = await listOrdersForExport(toOrderListQuery(params, new Date()));

      const csv = toCsv(
        HEADER,
        rows.map((row) => [
          row.number,
          formatAdminDateTime(row.createdAt),
          orderStatusDisplay(row).label,
          paymentStatusDisplay(row.paymentStatus).label,
          row.isTest,
          row.isDemo,
          row.customerName,
          row.email,
          phoneForDisplay(row.phone),
          row.lines,
          row.pieces,
          naira(row.subtotal),
          naira(row.discountTotal),
          row.couponCode,
          naira(row.shippingTotal),
          naira(row.total),
          deliveryLabel(row.deliveryMethod, row.deliveryZone),
          deliveryZoneName(row.deliveryZone),
          row.deliveryEstimate,
          row.shipLine1,
          row.shipLine2,
          row.shipCity,
          findState(row.shipState)?.name ?? row.shipState,
          row.shipPostalCode,
          row.deliveryNotes,
          row.carrier,
          row.trackingNumber,
          moment(row.paidAt),
          moment(row.shippedAt),
          moment(row.deliveredAt),
          moment(row.cancelledAt),
          moment(row.refundedAt),
        ]),
      );

      const filename = `tailored-by-tee-orders-${lagosDay.format(new Date())}.csv`;
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
          ...(truncated ? { "X-Export-Truncated": String(ORDERS_EXPORT_LIMIT) } : {}),
        },
      });
    },
    { limit: 20, windowMs: 60_000 },
  );
}
