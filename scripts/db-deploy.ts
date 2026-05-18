/*
 * §5 migration-safety pipeline. Replaces blind `drizzle-kit push --force`.
 * Runs in the Vercel build, where DATABASE_URL(_UNPOOLED), NEON_API_KEY and
 * NEON_PROJECT_ID are all present.
 *
 * Order (never reordered):
 *   1. §5.1  Snapshot: create + record a Neon branch off the default branch
 *            (the rollback target). Prune old snapshots to stay under quota.
 *   2. §5    Idempotency gate: clone a throwaway Neon branch, apply the
 *            reviewed migration TWICE, assert it is non-destructive and
 *            idempotent. On any failure, abort BEFORE production is touched.
 *   3. §5.2/4 Apply the reviewed migration to production (not push --force).
 *   4.        Run the idempotent seed.
 *   5. §5.5  Verify production: the live project survived, is owned
 *            correctly, and is nested under a Property owned by the same user.
 *
 * Any failure exits non-zero so the Vercel build fails and nothing ships.
 * Rollback = restore the snapshot branch logged in step 1.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const NEON_API = "https://console.neon.tech/api/v2";
const MIGRATION_FILE = "drizzle/0001_add_property.sql";
const KEEP_SNAPSHOTS = 3;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (required by the §5 pipeline)`);
  return v;
}

function gitSha(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    (() => {
      try {
        return execSync("git rev-parse --short HEAD").toString().trim();
      } catch {
        return "local";
      }
    })()
  );
}

/** Split the reviewed migration into individual statements. */
function migrationStatements(): string[] {
  const raw = readFileSync(MIGRATION_FILE, "utf8");
  return raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((chunk) => {
      const sansComments = chunk
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .trim();
      return sansComments.length > 0;
    });
}

type NeonBranch = { id: string; name: string; created_at?: string };

async function neonFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${NEON_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Neon API ${init?.method ?? "GET"} ${path} → ${res.status}: ${body}`,
    );
  }
  return res.status === 204 ? null : res.json();
}

async function createBranch(
  apiKey: string,
  projectId: string,
  name: string,
): Promise<{ branch: NeonBranch; connectionUri: string }> {
  const data = (await neonFetch(apiKey, `/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name },
      endpoints: [{ type: "read_write" }],
    }),
  })) as {
    branch: NeonBranch;
    connection_uris?: { connection_uri: string }[];
  };
  const connectionUri = data.connection_uris?.[0]?.connection_uri;
  if (!connectionUri) {
    throw new Error(`Neon branch ${name} returned no connection URI`);
  }
  return { branch: data.branch, connectionUri };
}

async function deleteBranch(
  apiKey: string,
  projectId: string,
  branchId: string,
): Promise<void> {
  await neonFetch(apiKey, `/projects/${projectId}/branches/${branchId}`, {
    method: "DELETE",
  });
}

async function listBranches(
  apiKey: string,
  projectId: string,
): Promise<NeonBranch[]> {
  const data = (await neonFetch(
    apiKey,
    `/projects/${projectId}/branches`,
  )) as { branches: NeonBranch[] };
  return data.branches ?? [];
}

type Db = ReturnType<typeof drizzle>;

function connect(uri: string): Db {
  return drizzle(neon(uri), { casing: "snake_case" });
}

async function exec(db: Db, statements: string[]): Promise<void> {
  for (const stmt of statements) await db.execute(sql.raw(stmt));
}

/** A fingerprint of the project table — used to prove non-destructiveness. */
type Probe = {
  projectCount: number;
  byId: Map<string, { ownerId: string; title: string; propertyId: string | null }>;
  propertyCount: number;
};

async function probe(db: Db): Promise<Probe> {
  const projects = (
    await db.execute(
      sql`select id, owner_id, title, property_id from "project"`,
    )
  ).rows as {
    id: string;
    owner_id: string;
    title: string;
    property_id: string | null;
  }[];
  let propertyCount = 0;
  try {
    propertyCount = Number(
      (await db.execute(sql`select count(*)::int as n from "property"`))
        .rows[0]!.n,
    );
  } catch {
    propertyCount = -1; // table does not exist yet (pre-migration)
  }
  return {
    projectCount: projects.length,
    propertyCount,
    byId: new Map(
      projects.map((p) => [
        p.id,
        { ownerId: p.owner_id, title: p.title, propertyId: p.property_id },
      ]),
    ),
  };
}

/** Throws unless every project survived, kept its owner, and is correctly
 *  nested under a Property owned by that same user. */
async function assertCorrectlyNested(db: Db, baseline: Probe): Promise<void> {
  const now = await probe(db);

  if (now.projectCount !== baseline.projectCount) {
    throw new Error(
      `DESTRUCTIVE: project count changed ${baseline.projectCount} → ${now.projectCount}`,
    );
  }
  for (const [id, before] of baseline.byId) {
    const after = now.byId.get(id);
    if (!after) throw new Error(`DESTRUCTIVE: project ${id} disappeared`);
    if (after.ownerId !== before.ownerId) {
      throw new Error(`DESTRUCTIVE: project ${id} changed owner`);
    }
    if (after.title !== before.title) {
      throw new Error(`DESTRUCTIVE: project ${id} changed title`);
    }
    if (!after.propertyId) {
      throw new Error(`INCOMPLETE: project ${id} still has no property`);
    }
  }
  const orphans = (
    await db.execute(
      sql`select p.id from "project" p
          left join "property" pr on pr.id = p.property_id
          where p.property_id is null or pr.id is null`,
    )
  ).rows as { id: string }[];
  if (orphans.length > 0) {
    throw new Error(
      `INCOMPLETE: ${orphans.length} project(s) not nested under a Property`,
    );
  }
  const mismatched = (
    await db.execute(
      sql`select p.id from "project" p
          join "property" pr on pr.id = p.property_id
          where pr.owner_id <> p.owner_id`,
    )
  ).rows as { id: string }[];
  if (mismatched.length > 0) {
    throw new Error(
      `WRONG OWNER: ${mismatched.length} project(s) nested under another user's Property`,
    );
  }
}

async function main() {
  const apiKey = requireEnv("NEON_API_KEY");
  const projectId = requireEnv("NEON_PROJECT_ID");
  const prodUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!prodUrl) throw new Error("DATABASE_URL(_UNPOOLED) is not set");

  const statements = migrationStatements();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sha = gitSha();

  /* ---- §5.1  Snapshot (rollback target) -------------------------------- */
  const snap = await createBranch(
    apiKey,
    projectId,
    `presnapshot-${stamp}-${sha}`,
  );
  console.log(
    `[§5.1] SNAPSHOT taken — branch "${snap.branch.name}" (id ${snap.branch.id}). ` +
      `Rollback = restore this branch in the Neon console / API.`,
  );

  // Prune older snapshots so we stay under the branch quota.
  const snaps = (await listBranches(apiKey, projectId))
    .filter((b) => b.name.startsWith("presnapshot-"))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  for (const old of snaps.slice(0, Math.max(0, snaps.length - KEEP_SNAPSHOTS))) {
    await deleteBranch(apiKey, projectId, old.id).catch((e) =>
      console.warn(`  (could not prune ${old.name}: ${e})`),
    );
  }

  /* ---- §5  Idempotency gate on a throwaway branch ---------------------- */
  const test = await createBranch(
    apiKey,
    projectId,
    `migrationtest-${stamp}-${sha}`,
  );
  try {
    const tdb = connect(test.connectionUri);
    const before = await probe(tdb);
    console.log(
      `[§5] Idempotency gate — cloned ${before.projectCount} project(s) onto "${test.branch.name}".`,
    );

    await exec(tdb, statements); // run 1
    await assertCorrectlyNested(tdb, before);
    const afterFirst = await probe(tdb);

    await exec(tdb, statements); // run 2 — must be a no-op
    await assertCorrectlyNested(tdb, before);
    const afterSecond = await probe(tdb);

    if (afterSecond.propertyCount !== afterFirst.propertyCount) {
      throw new Error(
        `NOT IDEMPOTENT: property count moved ${afterFirst.propertyCount} → ${afterSecond.propertyCount} on re-run`,
      );
    }
    for (const [id, a] of afterFirst.byId) {
      if (afterSecond.byId.get(id)?.propertyId !== a.propertyId) {
        throw new Error(`NOT IDEMPOTENT: project ${id} re-pointed on re-run`);
      }
    }
    console.log(
      `[§5] Gate PASSED — migration is non-destructive and idempotent (verified on a real Neon branch copy).`,
    );
  } finally {
    await deleteBranch(apiKey, projectId, test.branch.id).catch((e) =>
      console.warn(`  (could not delete test branch: ${e})`),
    );
  }

  /* ---- §5.2/§5.4  Apply the reviewed migration to production ----------- */
  const pdb = connect(prodUrl);
  const prodBefore = await probe(pdb);
  await exec(pdb, statements);
  console.log(
    `[§5.2] Reviewed migration applied to production (${prodBefore.projectCount} project(s)).`,
  );

  /* ---- Idempotent seed ------------------------------------------------- */
  execSync("npx tsx scripts/seed.ts", {
    stdio: "inherit",
    env: process.env,
  });

  /* ---- §5.5  Verify production ---------------------------------------- */
  await assertCorrectlyNested(pdb, prodBefore);
  const kitchen = (
    await pdb.execute(
      sql`select p.id, p.owner_id, pr.owner_id as property_owner
          from "project" p join "property" pr on pr.id = p.property_id
          where p.title = 'Kitchen Renovation'`,
    )
  ).rows as { id: string; owner_id: string; property_owner: string }[];
  for (const k of kitchen) {
    if (k.owner_id !== k.property_owner) {
      throw new Error(
        `§5.5 FAILED: "Kitchen Renovation" (${k.id}) nested under another user's Property`,
      );
    }
  }
  console.log(
    `[§5.5] Production verified — live data intact, owned correctly, nested under Property. ` +
      `Rollback target if ever needed: snapshot branch "${snap.branch.name}".`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n✗ §5 pipeline failed — nothing was shipped.");
    console.error(e);
    process.exit(1);
  });
