import type { Kobo } from "@/lib/catalog/types";

/** An order as its private page shows it: plain, serialisable, no internal ids. */
export interface OrderView {
  number: string;
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  paymentStatus: "pending" | "success" | "failed" | "abandoned" | "refunded";
  placedAt: string;
  reservedUntil: string | null;
  /** The latest payment attempt, if any. `isTest`: Paystack test mode, no real money moved. */
  lastPayment: { status: "pending" | "success" | "failed" | "abandoned" | "refunded"; isTest: boolean } | null;
  customerName: string;
  email: string;
  phone: string;
  items: {
    id: string;
    name: string;
    href: string;
    colorName: string;
    sizeLabel: string;
    imageUrl: string | null;
    unitPrice: Kobo;
    quantity: number;
    lineTotal: Kobo;
  }[];
  totals: { subtotal: Kobo; discountTotal: Kobo; shippingTotal: Kobo; total: Kobo };
  couponCode: string | null;
  delivery: {
    method: "delivery" | "pickup";
    label: string;
    estimate: string | null;
    addressLines: string[];
    notes: string | null;
  };
}
