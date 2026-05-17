import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/*
 * Lazy module-level init (NOT a Proxy wrapper).
 * Per Vercel storage guidance: a Proxy around the db client breaks
 * Auth.js's adapter introspection. A plain getDb() is build-safe and
 * avoids throwing at import time when DATABASE_URL is unset.
 */
type Db = ReturnType<typeof create>;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema, casing: "snake_case" });
}

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = create();
  return _db;
}

export { schema };
