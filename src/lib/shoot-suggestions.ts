import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { photos, properties, projects } from "@/db/schema";

/** Phase 5.9 lightweight Foreman-as-photographer. Cheap heuristic over
 *  the existing photo timeline — no AI call, no per-view spend. The
 *  Foreman invokes this as a presentational tool; the model wraps the
 *  raw suggestions in its own warm coaching tone.
 *
 *  Rules of thumb:
 *    - Each room with photos has a "freshness" = days since the most
 *      recent shot. Rooms older than the THRESHOLD are stale.
 *    - Rooms named on the Property but never photographed are blanks.
 *    - The most-overdue stale room comes first, then any never-shot
 *      Property rooms, capped at 3 suggestions total.
 *    - If everything is fresh (<14 days) and every Property room has
 *      coverage, returns an empty list — the Foreman can say so. */

const STALE_DAYS = 14;

export type ShootSuggestion =
  | {
      kind: "reshoot-room";
      room: string;
      daysSinceLast: number;
      lastPhotoId: string;
      lastPhotoUrl: string;
      prompt: string;
    }
  | {
      kind: "first-shot-of-room";
      room: string;
      prompt: string;
    };

export async function getShootSuggestions(input: {
  projectId: string;
  limit?: number;
}): Promise<ShootSuggestion[]> {
  const limit = input.limit ?? 3;
  const db = getDb();

  const [project] = await db
    .select({
      id: projects.id,
      propertyId: projects.propertyId,
    })
    .from(projects)
    .where(eq(projects.id, input.projectId));
  if (!project) return [];

  const propertyRooms: string[] = project.propertyId
    ? (
        await db
          .select({ rooms: properties.rooms })
          .from(properties)
          .where(eq(properties.id, project.propertyId))
      )[0]?.rooms?.map((r) => r.name) ?? []
    : [];

  const projectPhotos = await db
    .select({
      id: photos.id,
      url: photos.url,
      roomName: photos.roomName,
      takenAt: photos.takenAt,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .where(eq(photos.projectId, input.projectId));

  // Newest first — first occurrence per room is the most recent shot.
  const sorted = [...projectPhotos].sort((a, b) => {
    const ta = (a.takenAt ?? a.createdAt).getTime();
    const tb = (b.takenAt ?? b.createdAt).getTime();
    return tb - ta;
  });

  const latestByRoom = new Map<
    string,
    { id: string; url: string; lastStamp: number }
  >();
  for (const p of sorted) {
    if (!p.roomName) continue;
    if (latestByRoom.has(p.roomName)) continue;
    latestByRoom.set(p.roomName, {
      id: p.id,
      url: p.url,
      lastStamp: (p.takenAt ?? p.createdAt).getTime(),
    });
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const stale: ShootSuggestion[] = [];
  for (const [room, info] of latestByRoom) {
    const days = Math.floor((now - info.lastStamp) / dayMs);
    if (days < STALE_DAYS) continue;
    stale.push({
      kind: "reshoot-room",
      room,
      daysSinceLast: days,
      lastPhotoId: info.id,
      lastPhotoUrl: info.url,
      prompt: `It's been ${days} days since the last shot of the ${room.toLowerCase()}. A fresh wide from the same spot would extend the progress story.`,
    });
  }
  // Most-overdue first.
  stale.sort((a, b) =>
    a.kind === "reshoot-room" && b.kind === "reshoot-room"
      ? b.daysSinceLast - a.daysSinceLast
      : 0,
  );

  // Rooms on the Property that have NO photos yet — blanks worth filling.
  const photographedNames = new Set(
    [...latestByRoom.keys()].map((n) => n.trim().toLowerCase()),
  );
  const blanks: ShootSuggestion[] = [];
  for (const name of propertyRooms) {
    if (photographedNames.has(name.trim().toLowerCase())) continue;
    blanks.push({
      kind: "first-shot-of-room",
      room: name,
      prompt: `There's nothing on the timeline for the ${name.toLowerCase()} yet. A wide of it as it stands today would give the Foreman something to react to.`,
    });
  }

  return [...stale, ...blanks].slice(0, limit);
}
