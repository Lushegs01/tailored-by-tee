import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";

/*
 * Prisma CLI configuration (Prisma 7 keeps connection URLs here, not in the schema).
 *
 * Environment files load exactly as Next.js loads them (.env, .env.local, …), so
 * one `.env.local` serves the app and the CLI alike. (@next/env is CommonJS
 * without named-export hints, so it is read from the default export.)
 *
 * Migrations need Neon's direct connection (DATABASE_URL_UNPOOLED); the app itself
 * uses the pooled DATABASE_URL through the Neon adapter (src/lib/db.ts).
 * Commands that don't touch the database (e.g. `prisma generate`) run without either.
 */
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
