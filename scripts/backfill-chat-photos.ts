/* One-shot backfill: chat-uploaded photos used to go into Blob and into
 * chat_message.parts but never into the `photo` table — making them
 * invisible to the project's photo view. This script scans chat_message
 * for image file parts and writes the missing photo rows.
 *
 * Idempotent: skips any URL that already has a photo row. Best-effort:
 * messages that were compacted out of the rolling window are gone and
 * cannot be recovered. Safe to re-run.
 *
 * Usage: npm run db:backfill-photos
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const DB_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL[_UNPOOLED] not set");
  process.exit(1);
}

const db = drizzle(neon(DB_URL), { schema });

type FilePart = {
  type?: unknown;
  url?: unknown;
  mediaType?: unknown;
};

async function main() {
  console.log("Scanning chat_message for image attachments…");
  const rows = await db.select().from(schema.chatMessages);

  let scanned = 0;
  let inserted = 0;
  let skipped = 0;
  let unparseable = 0;

  for (const row of rows) {
    const parts = (row.parts as unknown[]) ?? [];
    for (const p of parts) {
      if (!p || typeof p !== "object") continue;
      const pt = p as FilePart;
      if (pt.type !== "file" || typeof pt.url !== "string") continue;
      const mediaType =
        typeof pt.mediaType === "string" ? pt.mediaType : "";
      if (!mediaType.startsWith("image/")) continue;
      scanned++;

      const url = pt.url;
      const existing = await db
        .select({ id: schema.photos.id })
        .from(schema.photos)
        .where(eq(schema.photos.url, url));
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      let pathname: string;
      try {
        pathname = new URL(url).pathname.replace(/^\//, "");
      } catch {
        unparseable++;
        console.warn(`  ! could not parse URL: ${url}`);
        continue;
      }
      if (!pathname) {
        unparseable++;
        console.warn(`  ! empty pathname for URL: ${url}`);
        continue;
      }

      await db.insert(schema.photos).values({
        projectId: row.projectId,
        taskId: row.taskId,
        uploaderId: row.authorId,
        url,
        pathname,
        caption: null,
        createdAt: row.createdAt,
      });
      inserted++;
      console.log(
        `  + ${row.projectId} ${row.taskId ?? "(project-level)"} ${url}`,
      );
    }
  }

  console.log(
    `\nDone. ${scanned} image attachments found · inserted ${inserted} · skipped ${skipped} (already in photos) · unparseable ${unparseable}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
