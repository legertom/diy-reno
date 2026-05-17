import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Neon's pooled (pgbouncer) endpoint breaks drizzle-kit DDL — prefer the
    // unpooled URL the Vercel/Neon integration injects; fall back otherwise.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
  casing: "snake_case",
});
