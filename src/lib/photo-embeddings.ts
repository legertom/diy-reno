import "server-only";
import { embed } from "ai";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { photos } from "@/db/schema";

/** Phase 5.7 same-angle pairing.
 *
 *  Provider choice: `google/text-embedding-004` over a constructed
 *  signature string (caption + tags + ROI captions). Per
 *  PHOTO_EXECUTION_PROMPT.md §3 item 2, "google/text-embedding-004 on
 *  the AI caption is an acceptable default." Text-over-vision is cheap,
 *  Vercel-native (same gateway), and surprisingly strong for
 *  "two photos OF the same thing" — the AI caption is itself a
 *  fingerprint for what the photo depicts. A dedicated image embedder
 *  is the upgrade path if telemetry shows false-negatives.
 *
 *  Cost discipline: runs once per upload alongside the vision pass; the
 *  result caches on `photo.embedding` (column exists since
 *  `drizzle/0006_photo_passive_vision.sql`). No per-view spend, no
 *  per-request cap. Same model on every photo so cosine is meaningful. */
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "google/text-embedding-004";

/** PHOTO_PLAN.md §5 Q5: cosine ≥ 0.85 → same-angle pair. Conservative
 *  on purpose; a wrong pair is worse than no pair. */
export const SAME_ANGLE_THRESHOLD = 0.85;

export class EmbeddingError extends Error {}

/** Build the fingerprint string for one photo. AI caption is the
 *  anchor; tags + ROI captions add precision. Skipped photos (no
 *  caption_ai yet) return null — the producer no-ops in that case. */
export function buildSignature(input: {
  captionAi: string | null;
  tags: string[] | null;
  rois:
    | { caption: string | null; category: string | null }[]
    | null;
}): string | null {
  const caption = input.captionAi?.trim();
  if (!caption) return null;
  const tags = (input.tags ?? []).filter(Boolean).join(", ");
  const roiText = (input.rois ?? [])
    .map((r) =>
      r.caption && r.category
        ? `${r.category}: ${r.caption}`
        : r.caption ?? null,
    )
    .filter((s): s is string => Boolean(s))
    .join("; ");
  return [caption, tags && `tags: ${tags}`, roiText && `regions: ${roiText}`]
    .filter(Boolean)
    .join(" | ");
}

/** Server-only: compute and persist the embedding for one photo. No-op
 *  if the photo has no vision caption yet (vision pass hasn't run, or
 *  it was a screenshot/receipt with an empty caption). Failures throw —
 *  caller decides how to surface, since embedding-failure shouldn't
 *  abort the rest of the vision pipeline. */
export async function embedPhoto(photoId: string): Promise<void> {
  const db = getDb();
  const [photo] = await db
    .select({
      id: photos.id,
      captionAi: photos.captionAi,
      tags: photos.tags,
      rois: photos.rois,
    })
    .from(photos)
    .where(eq(photos.id, photoId));
  if (!photo) throw new EmbeddingError("Photo not found");

  const signature = buildSignature({
    captionAi: photo.captionAi,
    tags: photo.tags,
    rois: (photo.rois ?? []).map((r) => ({
      caption: r.caption ?? null,
      category: r.category ?? null,
    })),
  });
  if (!signature) return; // nothing to embed yet

  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: signature,
  });

  await db
    .update(photos)
    .set({ embedding })
    .where(eq(photos.id, photoId));
}

/** Backfill missing embeddings for one project. Cap protects against
 *  runaway cost on first load of a project with many old photos.
 *  Returns the count actually backfilled (errors are swallowed per
 *  photo — one bad embedding shouldn't block the rest). */
export async function backfillProjectEmbeddings(input: {
  projectId: string;
  cap?: number;
}): Promise<number> {
  const cap = input.cap ?? 10;
  const db = getDb();
  const targets = await db
    .select({ id: photos.id })
    .from(photos)
    .where(
      and(
        eq(photos.projectId, input.projectId),
        isNotNull(photos.captionAi),
        isNull(photos.embedding),
      ),
    )
    .limit(cap);

  let done = 0;
  for (const t of targets) {
    try {
      await embedPhoto(t.id);
      done++;
    } catch (e) {
      console.warn(`[5.7] embedPhoto failed for ${t.id}:`, e);
    }
  }
  return done;
}

/** Cosine similarity for two equal-length embeddings. Returns 0 on
 *  shape mismatch instead of throwing — the caller is iterating across
 *  N×N pairs and one bad row shouldn't stop the rest. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** A member of a same-angle cluster — enough to render the diptych
 *  inline without a follow-up query. */
export type ClusterPhoto = {
  id: string;
  url: string;
  caption: string | null;
  captionAi: string | null;
  takenAt: Date | null;
  createdAt: Date;
};

/** A cluster of same-angle photos sorted by capture time (earliest →
 *  latest). 2+ photos by definition — singletons are dropped. */
export type AngleCluster = {
  id: string;
  members: ClusterPhoto[];
};

/** Read all embedded photos in a project and group them into clusters
 *  by cosine ≥ threshold. Greedy union-find: each photo joins the first
 *  cluster it matches; tighter pairs across clusters merge those
 *  clusters together. Returns clusters with 2+ photos only, each sorted
 *  by takenAt → createdAt to mirror the timeline order.
 *
 *  Cost note: this is N×N per project on each call. N is small (Tom's
 *  project is ~30 photos); we'll keep this in JS until usage forces
 *  pgvector. The cosine fn itself is cheap (~768d dot product). */
export async function findSameAnglePairs(
  projectId: string,
  threshold = SAME_ANGLE_THRESHOLD,
): Promise<AngleCluster[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: photos.id,
      url: photos.url,
      caption: photos.caption,
      captionAi: photos.captionAi,
      embedding: photos.embedding,
      takenAt: photos.takenAt,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .where(
      and(eq(photos.projectId, projectId), isNotNull(photos.embedding)),
    );

  const valid = rows.filter(
    (r): r is typeof r & { embedding: number[] } =>
      Array.isArray(r.embedding) && r.embedding.length > 0,
  );

  // Union-find: each photo starts as its own cluster; merge on match.
  const parent = new Map<string, string>();
  for (const r of valid) parent.set(r.id, r.id);
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, parent.get(next) ?? next);
      cur = parent.get(cur) ?? cur;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (cosine(valid[i].embedding, valid[j].embedding) >= threshold) {
        union(valid[i].id, valid[j].id);
      }
    }
  }

  const buckets = new Map<string, typeof valid>();
  for (const r of valid) {
    const root = find(r.id);
    const existing = buckets.get(root);
    if (existing) existing.push(r);
    else buckets.set(root, [r]);
  }

  return [...buckets.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([id, members]) => ({
      id,
      members: [...members]
        .sort((a, b) => {
          const ta = (a.takenAt ?? a.createdAt).getTime();
          const tb = (b.takenAt ?? b.createdAt).getTime();
          if (ta !== tb) return ta - tb;
          return a.createdAt < b.createdAt ? -1 : 1;
        })
        .map((m) => ({
          id: m.id,
          url: m.url,
          caption: m.caption,
          captionAi: m.captionAi,
          takenAt: m.takenAt,
          createdAt: m.createdAt,
        })),
    }));
}
