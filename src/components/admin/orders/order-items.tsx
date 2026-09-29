import Link from "next/link";

import { DataTable, RowHeader, TBody, THead, Td, Th, Tr } from "@/components/admin/ui";
import { productHref } from "@/components/admin/customers/customer-rules";
import { MediaImage } from "@/components/ui/media-image";
import { formatKobo } from "@/lib/admin/format";
import type { AdminOrderDetail } from "@/lib/admin/orders";
import { cn } from "@/lib/utils";

/*
 * The lines of an order, exactly as they were bought. Every value here is the
 * snapshot taken at checkout — the name, the SKU, the colour, the size and the
 * price the customer actually paid — so a piece later renamed, repriced or
 * archived never changes what this order says.
 *
 * The piece's name links to its admin page when the product still exists; the
 * snapshot stands on its own when it doesn't.
 */

type OrderItem = AdminOrderDetail["items"][number];

function Thumbnail({ imageUrl }: { imageUrl: string | null }) {
  return (
    <div className="w-12 shrink-0">
      {imageUrl ? (
        <MediaImage
          image={{ src: imageUrl, width: 800, height: 1000, alt: "", color: "#ece8df" }}
          ratio="4/5"
          sizes="48px"
          quality={60}
        />
      ) : (
        <div aria-hidden="true" className="aspect-4/5 bg-surface" />
      )}
    </div>
  );
}

export function OrderItemsTable({ items }: { items: readonly OrderItem[] }) {
  return (
    <DataTable caption="Pieces on this order" frameClassName="border-0">
      <THead>
        <Tr>
          <Th>Piece</Th>
          <Th align="end">Qty</Th>
          <Th align="end">Unit price</Th>
          <Th align="end">Line total</Th>
        </Tr>
      </THead>
      <TBody>
        {items.map((item) => (
          <Tr key={item.id}>
            <RowHeader>
              <div className="flex items-start gap-3">
                <Thumbnail imageUrl={item.imageUrl} />
                <div className="min-w-0">
                  <span className="block break-words">
                    {item.productId ? (
                      <Link href={productHref(item.productId)} className="link-underline-static">
                        {item.productName}
                      </Link>
                    ) : (
                      item.productName
                    )}
                  </span>
                  <span className="mt-0.5 block text-caption text-muted-foreground">
                    {[item.colorName, item.sizeLabel].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-0.5 block font-mono text-caption break-all text-muted-foreground">
                    {item.sku}
                  </span>
                </div>
              </div>
            </RowHeader>

            <Td label="Qty" align="end">
              <span className="tabular-nums">{item.quantity}</span>
            </Td>

            <Td label="Unit price" align="end">
              <span className="tabular-nums">{formatKobo(item.unitPrice)}</span>
              {item.compareAtUnitPrice && item.compareAtUnitPrice > item.unitPrice ? (
                <span className="block text-caption text-muted-foreground">
                  was <span className="tabular-nums line-through">{formatKobo(item.compareAtUnitPrice)}</span>
                </span>
              ) : null}
            </Td>

            <Td label="Line total" align="end">
              <span className="tabular-nums">{formatKobo(item.lineTotal)}</span>
            </Td>
          </Tr>
        ))}
      </TBody>
    </DataTable>
  );
}

/* ── What it came to ────────────────────────────────────────────────────── */

function TotalRow({
  label,
  value,
  strong = false,
  quiet = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  quiet?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-6 border-b py-2.5 last:border-b-0",
        strong && "border-b-0 border-t pt-3 text-body font-medium",
      )}
    >
      <dt className={cn("text-body-sm", quiet && "text-muted-foreground", strong && "text-body font-medium")}>
        {label}
      </dt>
      <dd className={cn("shrink-0 tabular-nums", strong ? "text-body" : "text-body-sm")}>{value}</dd>
    </div>
  );
}

export function OrderTotals({
  order,
}: {
  order: Pick<AdminOrderDetail, "subtotal" | "discountTotal" | "shippingTotal" | "total" | "couponCode">;
}) {
  const collectionOrFree = order.shippingTotal === 0;

  return (
    <dl className="ml-auto w-full max-w-sm">
      <TotalRow label="Subtotal" value={formatKobo(order.subtotal)} />
      {order.discountTotal > 0 ? (
        <TotalRow
          label={order.couponCode ? `Discount — ${order.couponCode}` : "Discount"}
          value={`−${formatKobo(order.discountTotal)}`}
        />
      ) : null}
      <TotalRow
        label="Delivery"
        value={collectionOrFree ? "Free" : formatKobo(order.shippingTotal)}
        quiet={collectionOrFree}
      />
      <TotalRow label="Order total" value={formatKobo(order.total)} strong />
    </dl>
  );
}
