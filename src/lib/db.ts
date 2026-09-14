import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

/*
 * The one Prisma client, on Neon's pooled connection via the Neon driver adapter
 * (WebSockets: serverless-friendly, with interactive transactions for stock).
 *
 * Created on first use rather than at import, so pages that never touch the
 * database — and builds without DATABASE_URL — still work. Kept on globalThis so
 * hot reloads in development and warm serverless invocations reuse one pool.
 */

const globalForDb = globalThis as typeof globalThis & { __tbtPrisma?: PrismaClient };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): PrismaClient {
  if (globalForDb.__tbtPrisma) return globalForDb.__tbtPrisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add Neon's pooled connection string to .env.local (see .env.example).",
    );
  }

  const client = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForDb.__tbtPrisma = client;
  return client;
}
