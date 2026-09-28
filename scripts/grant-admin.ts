/**
 * Gives someone access to the admin area (/admin), or takes it away.
 *
 *   npm run admin:grant -- owner@example.com            (shows what would happen)
 *   npm run admin:grant -- owner@example.com --yes      (does it)
 *   npm run admin:grant -- someone@example.com --revoke --yes
 *
 * Granting creates the account if that address has never signed in, so the
 * person can then sign in at /account/sign-in with an email link or Google (same
 * address) and open /admin. Revoking keeps their customer account and orders;
 * their admin access ends on their next click (roles are read from the database
 * on every request). The last remaining admin can't be revoked.
 *
 * Every change is recorded in the audit log (action "admin.grant" / "admin.revoke",
 * no actor: it came from the command line). Needs the admin migration applied
 * first (npm run db:deploy).
 */
import nextEnv from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { z } from "zod";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";

// @next/env is CommonJS without named-export hints, so it is read from the default export.
nextEnv.loadEnvConfig(process.cwd());

const USAGE = `Usage:
  npm run admin:grant -- <email>            show what would change
  npm run admin:grant -- <email> --yes      give admin access
  npm run admin:grant -- <email> --revoke --yes   remove admin access`;

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

interface Options {
  email: string;
  revoke: boolean;
  confirmed: boolean;
}

class UsageError extends Error {}

function readOptions(argv: string[]): Options {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const unknown = [...flags].filter((flag) => !["--yes", "--revoke", "--help"].includes(flag));

  if (flags.has("--help")) throw new UsageError("");
  if (unknown.length > 0) throw new UsageError(`Unknown option: ${unknown.join(", ")}`);
  if (positional.length !== 1) throw new UsageError("Give exactly one email address.");

  const parsed = emailSchema.safeParse(positional[0]);
  if (!parsed.success) throw new UsageError(`"${positional[0]}" isn't a valid email address.`);

  return { email: parsed.data, revoke: flags.has("--revoke"), confirmed: flags.has("--yes") };
}

/** Only the host, e.g. "ep-quiet-sun-123.eu-central-1.aws.neon.tech" — never credentials or the full URL. */
function databaseHost(connectionString: string): string {
  try {
    return new URL(connectionString).hostname || "(unknown host)";
  } catch {
    return "(unreadable connection string)";
  }
}

const userSelect = { id: true, email: true, role: true } as const;

async function grant(db: PrismaClient, email: string, confirmed: boolean): Promise<void> {
  const existing = await db.user.findUnique({ where: { email }, select: userSelect });

  if (existing?.role === "ADMIN") {
    console.log(`${email} already has admin access. Nothing to change.`);
    return;
  }

  const plan = existing
    ? `Give admin access to the existing account ${email}.`
    : `Create an account for ${email} and give it admin access.`;
  if (!confirmed) {
    console.log(`Would: ${plan}\nNothing has changed. Run again with --yes to do it.`);
    return;
  }

  const user = await db.$transaction(async (tx) => {
    const saved = await tx.user.upsert({
      where: { email },
      create: { email, role: "ADMIN" },
      update: { role: "ADMIN" },
      select: userSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "admin.grant",
        entityType: "User",
        entityId: saved.id,
        summary: `Gave admin access to ${email} from the command line.`,
        metadata: { email, createdAccount: !existing, previousRole: existing?.role ?? null },
      },
      select: { id: true },
    });
    return saved;
  });

  console.log(
    `Done: ${email} now has admin access${existing ? "" : " (new account created)"}.\n` +
      `They can sign in at /account/sign-in with this address, then open /admin.\n` +
      `User id: ${user.id}`,
  );
}

async function revoke(db: PrismaClient, email: string, confirmed: boolean): Promise<void> {
  const existing = await db.user.findUnique({ where: { email }, select: userSelect });
  if (!existing) {
    console.log(`There is no account for ${email}. Nothing to change.`);
    return;
  }
  if (existing.role !== "ADMIN") {
    console.log(`${email} doesn't have admin access. Nothing to change.`);
    return;
  }

  const admins = await db.user.count({ where: { role: "ADMIN" } });
  if (admins <= 1) {
    throw new UsageError(`${email} is the only admin. Give someone else admin access first, then revoke this one.`);
  }

  if (!confirmed) {
    console.log(`Would: remove admin access from ${email} (their customer account stays).\nNothing has changed. Run again with --yes to do it.`);
    return;
  }

  await db.$transaction(async (tx) => {
    // Lock every admin row first, so two revokes running at once can't both see
    // "another admin remains" and leave the store with none.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "role" = 'ADMIN' FOR UPDATE`;
    if (!locked.some((row) => row.id === existing.id)) {
      throw new UsageError(`${email} no longer has admin access. Nothing changed.`);
    }
    if (locked.length <= 1) {
      throw new UsageError(`${email} is the only admin. Give someone else admin access first, then revoke this one.`);
    }

    await tx.user.update({ where: { id: existing.id }, data: { role: "CUSTOMER" }, select: { id: true } });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "admin.revoke",
        entityType: "User",
        entityId: existing.id,
        summary: `Removed admin access from ${email} from the command line.`,
        metadata: { email },
      },
      select: { id: true },
    });
  });

  console.log(`Done: ${email} no longer has admin access. Their customer account and orders are unchanged.`);
}

async function main() {
  let options: Options;
  try {
    options = readOptions(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      if (error.message) console.error(error.message);
      console.error(USAGE);
      process.exitCode = error.message ? 1 : 0;
      return;
    }
    throw error;
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new UsageError("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) in .env.local first — see .env.example.");
  }

  console.log(`Database: ${databaseHost(connectionString)}`);
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    if (options.revoke) await revoke(db, options.email, options.confirmed);
    else await grant(db, options.email, options.confirmed);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(error.message);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    console.error("The database is missing the admin tables. Run `npm run db:deploy` first, then try again.");
  } else {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  }
  process.exitCode = 1;
});
