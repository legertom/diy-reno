import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

/*
 * Lazy config: NextAuth accepts a function that returns the config.
 * This defers DrizzleAdapter (and getDb()) until a request, so
 * `next build` never evaluates the DB connection at import time.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();
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
