/**
 * Fills the store with a demo set — customers, orders, payments, refunds and
 * reviews — so the admin area can be tried before real trading starts.
 *
 *   npm run db:seed:demo                    show what would happen
 *   npm run db:seed:demo -- --yes           write it
 *   npm run db:seed:demo -- --yes --allow-production   (only with NODE_ENV=production)
 *
 * ⚠ This project uses ONE Neon database for development and production. The script
 * prints the database host first, writes nothing without --yes, and refuses to run
 * against a production environment unless --allow-production is passed as well.
 *
 * Everything it writes is marked: demo accounts are on the reserved example.com
 * domain with User.isDemo, orders are numbered DEMO-2026-000001 with Order.isDemo
 * (the real ORD- counter is never touched), payments carry Payment.isTest and
 * reviews Review.isDemo. `npm run db:clear-demo` takes all of it out again.
 *
 * It does NOT touch stock. Demo sales hold, sell and return nothing: the shop's
 * inventory stays true while the admin area is being tried. See docs/demo-data.md.
 *
 * Running it twice is safe: the previous demo store is removed and written again
 * inside one transaction, so there is never a second copy and never a half-written one.
 */
import { Prisma } from "../src/generated/prisma/client";
import { lagosCalendarParts, summariseDemoPlan } from "../src/lib/admin/demo-fixtures";

import {
  DemoScriptError,
  createClient,
  databaseHost,
  deleteDemoData,
  findConflictingEmails,
  findConflictingOrderNumbers,
  isProductionEnvironment,
  loadDemoCatalogue,
  loadEnvironment,
  readConnectionString,
  readDemoFlags,
  seedDemoData,
  totalDeleted,
  type DemoCatalogue,
} from "./lib/demo-data";

const USAGE = `Usage:
  npm run db:seed:demo                                  show what would be created
  npm run db:seed:demo -- --yes                         create the demo store
  npm run db:seed:demo -- --yes --allow-production      also needed when NODE_ENV=production

Everything it creates is marked as demo data and can be removed with:
  npm run db:clear-demo -- --yes`;

const TRANSACTION = { maxWait: 15_000, timeout: 120_000 } as const;

function describePlan(): void {
  const plan = summariseDemoPlan();
  const statuses = Object.entries(plan.ordersByStatus)
    .map(([status, count]) => `${count} ${status.toLowerCase()}`)
    .join(", ");

  console.log(
    [
      "",
      "The demo store:",
      `  ${plan.customers} customers (${plan.registeredCustomers} with accounts, the rest guests), all on example.com`,
      `  ${plan.orders} orders over the last 60 days — ${statuses}`,
      `  ${plan.refunds} of those carry a refund record`,
      `  ${plan.reviews} reviews (${plan.reviewsByStatus.PENDING} waiting for approval)`,
      "  No stock is held, sold or returned: demo sales exist for the screens only.",
      "",
    ].join("\n"),
  );
}

async function preflight(db: ReturnType<typeof createClient>, year: number): Promise<DemoCatalogue> {
  const demoAdmins = await db.user.findMany({ where: { isDemo: true, role: "ADMIN" }, select: { email: true } });
  if (demoAdmins.length > 0) {
    throw new DemoScriptError(
      `A demo account has been given admin access: ${demoAdmins.map((user) => user.email).join(", ")}.\n` +
        "Remove that access first (npm run admin:grant -- <email> --revoke --yes), then run this again.",
    );
  }

  const [emails, numbers] = await Promise.all([findConflictingEmails(db), findConflictingOrderNumbers(db, year)]);
  if (emails.length > 0) {
    throw new DemoScriptError(
      `These addresses already belong to real accounts: ${emails.join(", ")}.\nNothing has been changed.`,
    );
  }
  if (numbers.length > 0) {
    throw new DemoScriptError(
      `These order numbers already belong to real orders: ${numbers.join(", ")}.\nNothing has been changed.`,
    );
  }

  const catalogue = await loadDemoCatalogue(db);
  if (catalogue.variants.length === 0) {
    throw new DemoScriptError(
      "The shop has no live pieces to sell yet, so there is nothing for demo orders to contain.\n" +
        "Run `npm run db:seed` first, or make a product live in the admin area, then try again.",
    );
  }
  return catalogue;
}

async function main(): Promise<void> {
  const flags = readDemoFlags(process.argv.slice(2), ["--yes", "--allow-production"]);
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  loadEnvironment();
  const connectionString = readConnectionString();
  console.log(`Database: ${databaseHost(connectionString)}`);
  describePlan();

  if (isProductionEnvironment() && !flags.allowProduction) {
    throw new DemoScriptError(
      "NODE_ENV is production. If this really is the store you mean, run it again with --allow-production as well.",
    );
  }

  if (!flags.confirmed) {
    console.log("Nothing has been written. Run it again with --yes to create the demo store.");
    return;
  }

  const now = new Date();
  const db = createClient(connectionString);
  try {
    // Order numbers carry the Lagos year, so the check has to use the same one.
    const catalogue = await preflight(db, lagosCalendarParts(now).year);
    console.log(
      `Using ${catalogue.variants.length} live variants across ${catalogue.products.length} products` +
        `${catalogue.coupon ? `, and the discount code ${catalogue.coupon.code} where it applies` : ""}.`,
    );

    const { removed, skipped, counts } = await db.$transaction(async (tx) => {
      const cleared = await deleteDemoData(tx);
      const written = await seedDemoData(tx, catalogue, now);
      return { removed: totalDeleted(cleared.counts), skipped: cleared.skipped, counts: written };
    }, TRANSACTION);

    for (const note of skipped) console.warn(`Note: ${note}`);
    if (removed > 0) console.log(`Replaced an earlier demo store (${removed} rows removed first).`);

    console.log(
      [
        "",
        "Done. Created:",
        `  ${counts.users} accounts, ${counts.addresses} addresses, ${counts.wishlists} wishlists`,
        `  ${counts.orders} orders with ${counts.orderItems} lines, ${counts.payments} payments, ${counts.orderEvents} timeline entries`,
        `  ${counts.refunds} refunds, ${counts.couponUsages} discount-code uses (${counts.discountedOrders} orders)`,
        `  ${counts.reviews} reviews`,
        "",
        "Stock was not touched. Open /admin to look around.",
        "Remove it all again with: npm run db:clear-demo -- --yes",
      ].join("\n"),
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
