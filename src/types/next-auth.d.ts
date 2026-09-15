import type { DefaultSession } from "next-auth";

/*
 * What our sessions carry beyond Auth.js's defaults: the user's id (for scoping
 * every account query) and role (for the admin area).
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "ADMIN";
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role?: "CUSTOMER" | "ADMIN";
  }
}
