/**
 * Removes everything `npm run db:seed:demo` created, and nothing else.
 *
 *   npm run db:clear-demo               show what would be removed
 *   npm run db:clear-demo -- --yes      remove it
 *
 * ⚠ This project uses ONE Neon database for development and production, so the
 * script prints the database host first and deletes nothing without --yes.
 *
 * What it removes, in one transaction:
 *   demo reviews (Review.isDemo)
 *   demo orders (Order.isDemo) with their lines, payments, refunds, timeline
 *     entries and discount-code uses
 *   demo accounts (User.isDemo) with their sessions, sign-in links, addresses,
 *     wishlists and bags
 *
 * Two rails protect the live store. An order marked as demo whose number isn't a
 * DEMO- number is left alone and reported, and a demo account that has since been
 * given admin access is left alone too — so clearing the demo store can never
 * lock the owner out of /admin. Real orders, products, stock and discount codes
 * are never read for deletion at all.
 */
import { Prisma } from "../src/generated/prisma/client";
import { isDemoOrderNumber } from "../src/lib/admin/demo-fixtures";

import {
  DemoScriptError,
  createClient,
  databaseHost,
  deleteDemoData,
  loadEnvironment,
  readConnectionString,
  readDemoFlags,
  totalDeleted,
  type DemoDeletionCounts,
} from "./lib/demo-data";

const USAGE = `Usage:
  npm run db:clear-demo               show what would be removed
  npm run db:clear-demo -- --yes      remove the demo store`;

const TRANSACTION = { maxWait: 15_000, timeout: 120_000 } as const;

const LABELS: Record<keyof DemoDeletionCounts, string> = {
  reviews: "reviews",
  couponUsages: "discount-code uses",
  refunds: "refunds",
  orderEvents: "timeline entries",
  payments: "payments",
  orderItems: "order lines",
  stockAdjustments: "stock adjustments",
  orders: "orders",
  wishlistItems: "wishlist items",
  wishlists: "wishlists",
  cartItems: "bag items",
  carts: "bags",
  addresses: "addresses",
  sessions: "sign-in sessions",
  accounts: "linked sign-in accounts",
  users: "accounts",
};

function report(counts: DemoDeletionCounts): string[] {
  return (Object.keys(LABELS) as (keyof DemoDeletionCounts)[])
    .filter((key) => counts[key] > 0)
    .map((key) => `  ${counts[key]} ${LABELS[key]}`);
}

/** Counts what a run would remove, without removing it: the same reads, rolled back. */
async function countOnly(db: ReturnType<typeof createClient>): Promise<{ counts: DemoDeletionCounts; skipped: string[] }> {
  const [reviews, orders, users] = await Promise.all([
    db.review.count({ where: { isDemo: true } }),
    db.order.findMany({ where: { isDemo: true }, select: { id: true, number: true } }),
    db.user.findMany({ where: { isDemo: true }, select: { id: true, email: true, role: true } }),
  ]);

  const skipped: string[] = [];
  const orderIds: string[] = [];
  for (const order of orders) {
    if (isDemoOrderNumber(order.number)) orderIds.push(order.id);
    else skipped.push(`Order ${order.number} is marked as demo but isn't numbered like one — it would be left alone.`);
  }
  const userIds: string[] = [];
  for (const user of users) {
    if (user.role === "ADMIN") skipped.push(`${user.email} is a demo account with admin access — it would be left alone.`);
    else userIds.push(user.id);
  }

  const byOrder = { orderId: { in: orderIds } };
  const byUser = { userId: { in: userIds } };
  const [couponUsages, refunds, orderEvents, payments, orderItems, stockAdjustments] = await Promise.all([
    db.couponUsage.count({ where: byOrder }),
    db.refund.count({ where: byOrder }),
    db.orderEvent.count({ where: byOrder }),
    db.payment.count({ where: byOrder }),
    db.orderItem.count({ where: byOrder }),
    db.inventoryAdjustment.count({ where: byOrder }),
  ]);
  const [wishlistItems, wishlists, cartItems, carts, addresses, sessions, accounts] = await Promise.all([
    db.wishlistItem.count({ where: { wishlist: { is: byUser } } }),
    db.wishlist.count({ where: byUser }),
    db.cartItem.count({ where: { cart: { is: byUser } } }),
    db.cart.count({ where: byUser }),
    db.address.count({ where: byUser }),
    db.session.count({ where: byUser }),
    db.account.count({ where: byUser }),
  ]);

  return {
    counts: {
      reviews,
      couponUsages,
      refunds,
      orderEvents,
      payments,
      orderItems,
      stockAdjustments,
      orders: orderIds.length,
      wishlistItems,
      wishlists,
      cartItems,
      carts,
      addresses,
      sessions,
      accounts,
      users: userIds.length,
    },
    skipped,
  };
}

async function main(): Promise<void> {
  const flags = readDemoFlags(process.argv.slice(2), ["--yes"]);
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  loadEnvironment();
  const connectionString = readConnectionString();
  console.log(`Database: ${databaseHost(connectionString)}`);

  const db = createClient(connectionString);
  try {
    if (!flags.confirmed) {
      const { counts, skipped } = await countOnly(db);
      for (const note of skipped) console.warn(`Note: ${note}`);
      const lines = report(counts);
      if (lines.length === 0) {
        console.log("There is no demo data in this database. Nothing to remove.");
        return;
      }
      console.log(["", "Would remove:", ...lines, "", "Nothing has changed. Run it again with --yes to remove it."].join("\n"));
      return;
    }

    const { counts, skipped } = await db.$transaction(async (tx) => deleteDemoData(tx), TRANSACTION);
    for (const note of skipped) console.warn(`Note: ${note}`);

    if (totalDeleted(counts) === 0) {
      console.log("There was no demo data in this database. Nothing was removed.");
      return;
    }
    console.log(
      ["", "Done. Removed:", ...report(counts), "", "Real orders, products, stock and discount codes were not touched."].join("\n"),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof DemoScriptError) {
    console.error(error.message);
    console.error(`\n${USAGE}`);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    console.error("The database is missing the admin tables. Run `npm run db:deploy` first, then try again.");
  } else {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  }
  process.exitCode = 1;
});
