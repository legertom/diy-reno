/* Blob-side orphan rescue. Complementary to backfill-chat-photos:
 *
 *   backfill-chat-photos.ts  — finds image parts in `chat_message` that
 *                              never made it into the `photo` table.
 *   backfill-blob-orphans.ts — finds Blob objects under projects/<id>/
 *                              that never made it into the `photo` table
 *                              at all (uploaded by any path, including
 *                              old code paths before uploadProjectPhoto
 *                              was the chokepoint).
 *
 * Strategy:
 *   1. Paginate Vercel Blob list({ prefix: "projects/" }).
 *   2. For each blob whose pathname looks like `projects/<id>/<rest>`:
 *      - Skip if `<rest>` starts with `dream/` (those are cached dream
 *        renders, not user photos — see src/lib/dream.ts).
 *      - Skip if `<id>` isn't a project we have a row for.
 *      - Skip if there's already a `photo` row with this pathname.
 *      - INSERT a row attributed to the project's owner. If the path
 *        segment after `<id>` looks like a task id we have, attach it;
 *        otherwise leave taskId null (the photo shows up as project-
 *        level on the timeline, which is the safe default).
 *
 * Idempotent: re-running on a clean store is a no-op (the EXISTS check
 * skips everything). Safe to run on every Vercel build, and that's what
 * package.json wires it to.
 *
 * Usage: npm run db:backfill-blob-orphans  (or runs automatically in
 * the Vercel build via vercel.json's buildCommand).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { list, type ListBlobResult } from "@vercel/blob";
import { inArray } from "drizzle-orm";
import * as schema from "../src/db/schema";

const DB_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL[_UNPOOLED] not set");
  process.exit(1);
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not set");
  process.exit(1);
}

// Must match src/db/index.ts — without the casing option, drizzle emits
// the camelCase field names and Postgres rejects them.
const db = drizzle(neon(DB_URL), { schema, casing: "snake_case" });

type Blob = ListBlobResult["blobs"][number];

async function listAllBlobs(): Promise<Blob[]> {
  const out: Blob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: "projects/",
      cursor,
      limit: 1000,
      token: BLOB_TOKEN,
    });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

function parsePathname(pathname: string): {
  projectId: string;
  prefix: string;
  filename: string;
} | null {
  // Expected shape: projects/<projectId>/<prefix>/<filename...>
  const m = /^projects\/([^/]+)\/([^/]+)\/(.+)$/.exec(pathname);
  if (!m) return null;
  return { projectId: m[1], prefix: m[2], filename: m[3] };
}

async function main() {
  console.log("Listing all Vercel Blobs under projects/…");
  const blobs = await listAllBlobs();
  console.log(`  found ${blobs.length} blobs`);

  // Existing photos lookup keyed by pathname AND by url. Either match
  // means "already rescued."
  const existingPaths = new Set<string>();
  const existingUrls = new Set<string>();
  const photoRows = await db
    .select({ pathname: schema.photos.pathname, url: schema.photos.url })
    .from(schema.photos);
  for (const r of photoRows) {
    if (r.pathname) existingPaths.add(r.pathname);
    if (r.url) existingUrls.add(r.url);
  }
  console.log(`  ${photoRows.length} photo rows already on file`);

  // Project owners keyed by projectId — needed for the uploaderId.
  // Also gives us the implicit "is this a real project we should rescue
  // into" check.
  const projectRows = await db
    .select({ id: schema.projects.id, ownerId: schema.projects.ownerId })
    .from(schema.projects);
  const projectOwner = new Map(projectRows.map((p) => [p.id, p.ownerId]));

  // Task ids per project, to optionally attach the rescued photo to the
  // task whose id is the prefix segment.
  const allTasks = await db
    .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
    .from(schema.tasks)
    .where(inArray(schema.tasks.projectId, [...projectOwner.keys()]));
  const tasksByProject = new Map<string, Set<string>>();
  for (const t of allTasks) {
    if (!tasksByProject.has(t.projectId)) {
      tasksByProject.set(t.projectId, new Set());
    }
    tasksByProject.get(t.projectId)!.add(t.id);
  }

  let scanned = 0;
  let skippedDream = 0;
  let skippedExisting = 0;
  let skippedUnknownProject = 0;
  let skippedNonImage = 0;
  let rescued = 0;

  for (const blob of blobs) {
    scanned++;
    if (existingPaths.has(blob.pathname) || existingUrls.has(blob.url)) {
      skippedExisting++;
      continue;
    }
    const parsed = parsePathname(blob.pathname);
    if (!parsed) {
      skippedNonImage++;
      continue;
    }
    if (parsed.prefix === "dream") {
      skippedDream++;
      continue;
    }
    const ownerId = projectOwner.get(parsed.projectId);
    if (!ownerId) {
      skippedUnknownProject++;
      console.warn(
        `  ! blob references unknown project: ${blob.pathname}`,
      );
      continue;
    }

    // If the prefix segment looks like one of this project's task ids,
    // attach the photo to that task. Otherwise leave it project-level.
    const taskSet = tasksByProject.get(parsed.projectId);
    const taskId =
      taskSet && taskSet.has(parsed.prefix) ? parsed.prefix : null;

    // Best-effort content-type check: only insert image blobs. We don't
    // have the media-type from list(), but extension filtering is good
    // enough — backfill-chat-photos uses the same heuristic.
    const lower = blob.pathname.toLowerCase();
    if (
      !lower.endsWith(".jpg") &&
      !lower.endsWith(".jpeg") &&
      !lower.endsWith(".png") &&
      !lower.endsWith(".webp") &&
      !lower.endsWith(".gif") &&
      !lower.endsWith(".heic")
    ) {
      skippedNonImage++;
      continue;
    }

    await db.insert(schema.photos).values({
      projectId: parsed.projectId,
      taskId,
      uploaderId: ownerId,
      url: blob.url,
      pathname: blob.pathname,
      caption: null,
      createdAt: blob.uploadedAt,
    });
    rescued++;
    console.log(
      `  + ${parsed.projectId} ${taskId ?? "(project-level)"} ${blob.pathname}`,
    );
  }

  console.log(
    `\nDone. ${scanned} blobs scanned · rescued ${rescued} · skipped: existing=${skippedExisting} dream=${skippedDream} unknown-project=${skippedUnknownProject} non-image=${skippedNonImage}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
