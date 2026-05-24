import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

/*
 * Lazy config: NextAuth accepts a function that returns the config.
 * This defers DrizzleAdapter (and getDb()) until a request, so
 * `next build` never evaluates the DB connection at import time.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();

  // Dev/testing credentials provider — only active when AUTH_DEV_TOKEN is set.
  // Accepts a secret token and signs in as AUTH_DEV_EMAIL (or the default).
  // Never enable in production.
  const devProvider =
    process.env.AUTH_DEV_TOKEN
      ? Credentials({
          id: "dev-token",
          name: "Dev Token",
          credentials: { token: { label: "Dev token", type: "password" } },
          async authorize(credentials) {
            if (credentials?.token !== process.env.AUTH_DEV_TOKEN) return null;
            const email =
              process.env.AUTH_DEV_EMAIL ?? "roofusmarlowe@gmail.com";
            // Look up or create the user row
            const existing = await db
              .select()
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
            if (existing.length > 0) return existing[0];
            const [created] = await db
              .insert(users)
              .values({ email, name: "Dev User" })
              .returning();
            return created;
          },
        })
      : null;

  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
      Google({
        // Single Google-verified provider: link sign-in to a pre-seeded
        // user row that shares the same email (lets the seeded Kitchen
        // project land on the owner's first login).
        allowDangerousEmailAccountLinking: true,
      }),
      ...(devProvider ? [devProvider] : []),
    ],
    session: { strategy: "database" },
    trustHost: true,
    pages: { signIn: "/signin" },
    callbacks: {
      session({ session, user }) {
        if (session.user) session.user.id = user.id;
        return session;
      },
    },
  };
});
