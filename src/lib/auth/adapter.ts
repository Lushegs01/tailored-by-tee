import "server-only";

import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

/*
 * Auth.js storage on our own Prisma 7 client. (The official @auth/prisma-adapter
 * supports Prisma up to 6 and types against @prisma/client; this is the same
 * contract, written against the generated client this project uses.)
 *
 * Emails are stored lower-case, and a sign-in link's token is deleted the moment
 * it is used, so each link works exactly once.
 */

type StoredUser = { id: string; email: string; emailVerified: Date | null; name: string | null; image: string | null; role: "CUSTOMER" | "ADMIN" };

function toAdapterUser(user: StoredUser): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
    role: user.role,
  };
}

const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";

export function authAdapter(): Adapter {
  return {
    async createUser({ email, emailVerified, name, image }) {
      const user = await getDb().user.create({
        data: { email: email.trim().toLowerCase(), emailVerified, name: name ?? null, image: image ?? null },
      });
      return toAdapterUser(user);
    },

    async getUser(id) {
      const user = await getDb().user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await getDb().user.findUnique({ where: { email: email.trim().toLowerCase() } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await getDb().account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },

    async updateUser({ id, email, emailVerified, name, image }) {
      const user = await getDb().user.update({
        where: { id },
        data: {
          ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
          ...(emailVerified !== undefined ? { emailVerified } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(image !== undefined ? { image } : {}),
        },
      });
      return toAdapterUser(user);
    },

    async deleteUser(id) {
      await getDb().user.delete({ where: { id } });
    },

    async linkAccount(account: AdapterAccount) {
      await getDb().account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token ?? null,
          access_token: account.access_token ?? null,
          expires_at: account.expires_at ?? null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
          session_state:
            account.session_state == null
              ? null
              : typeof account.session_state === "string"
                ? account.session_state
                : JSON.stringify(account.session_state),
        },
      });
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await getDb().account.deleteMany({ where: { provider, providerAccountId } });
    },

    async createSession({ sessionToken, userId, expires }) {
      const session = await getDb().session.create({ data: { sessionToken, userId, expires } });
      return { sessionToken: session.sessionToken, userId: session.userId, expires: session.expires };
    },

    async getSessionAndUser(sessionToken) {
      const session = await getDb().session.findUnique({ where: { sessionToken }, include: { user: true } });
      if (!session) return null;
      return {
        session: { sessionToken: session.sessionToken, userId: session.userId, expires: session.expires },
        user: toAdapterUser(session.user),
      };
    },

    async updateSession({ sessionToken, expires, userId }) {
      try {
        const session = await getDb().session.update({
          where: { sessionToken },
          data: { ...(expires ? { expires } : {}), ...(userId ? { userId } : {}) },
        });
        return { sessionToken: session.sessionToken, userId: session.userId, expires: session.expires };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async deleteSession(sessionToken) {
      await getDb().session.deleteMany({ where: { sessionToken } });
    },

    async createVerificationToken({ identifier, token, expires }) {
      await getDb().verificationToken.create({ data: { identifier, token, expires } });
      return { identifier, token, expires };
    },

    async useVerificationToken({ identifier, token }) {
      try {
        // Deleting is the use: a second click on the same link finds nothing.
        return await getDb().verificationToken.delete({ where: { identifier_token: { identifier, token } } });
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
  };
}
