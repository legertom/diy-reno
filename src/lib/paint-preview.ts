import "server-only";
import { generateText } from "ai";
import { put, head } from "@vercel/blob";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { photos, generationLogs } from "@/db/schema";

/** Phase 5.11 v0 paint preview. Mask-and-recolor through Vercel AI Gateway
 *  with the same provider as the dream hero (PHOTO_PLAN.md §5 Q1 — Gemini
 *  2.5 Flash Image, "Nano Banana"). One model, two surfaces; if the dream
 *  reassessment after 20 renders flips us to FLUX Kontext, paint preview
 *  follows that switch via the same env override.
 *
 *  Cost discipline (BLOCKED.md Resolution 2026-05-26):
 *    - cap = 5 renders/day per user, hard server-side
 *    - cap counts SUCCESSFUL renders only; cache hits are free
 *    - cache key = (photoId, normalized color hex); a re-pick of the same
 *      color on the same photo is free forever (until the source photo
 *      is deleted, which cascades the blob).
 *    - cap window = today UTC. Rolls at midnight UTC, not local.
 *
 *  Provider override mirrors dream.ts so a flip stays a single env var. */
const PAINT_MODEL =
  process.env.PAINT_PREVIEW_MODEL ||
  process.env.DREAM_MODEL ||
  "google/gemini-2.5-flash-image";

export const PAINT_PREVIEW_CAP_PER_DAY = 5;
export const PAINT_PREVIEW_COST_CENTS = 4;
export const PAINT_PREVIEW_KIND = "paint_preview";

export class PaintPreviewError extends Error {}
export class PaintCapExceededError extends PaintPreviewError {
  constructor(
    readonly used: number,
    readonly cap: number,
  ) {
    super(`Daily paint-preview cap reached (${used}/${cap})`);
  }
}

/** Today's per-user spend snapshot. Surfaced in the dream-hero
 *  "Why this image?" panel + the lightbox entrypoint so the user always
 *  sees what they've used before clicking. */
export type PaintSpendToday = {
  used: number;
  cap: number;
  remaining: number;
};

/** Public: read today's spend without rendering. */
export async function getPaintSpendToday(
  userId: string,
): Promise<PaintSpendToday> {
  const db = getDb();
  const used = await countTodayRenders(db, userId);
  return {
    used,
    cap: PAINT_PREVIEW_CAP_PER_DAY,
    remaining: Math.max(0, PAINT_PREVIEW_CAP_PER_DAY - used),
  };
}

type Db = ReturnType<typeof getDb>;

async function countTodayRenders(db: Db, userId: string): Promise<number> {
  const start = utcDayStart();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(generationLogs)
    .where(
      and(
        eq(generationLogs.userId, userId),
        eq(generationLogs.kind, PAINT_PREVIEW_KIND),
        gte(generationLogs.createdAt, start),
      ),
    );
  return rows[0]?.n ?? 0;
}

function utcDayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Normalize a freeform color string into `#rrggbb` lowercase. Returns
 *  null if the input isn't a recognizable hex color. v0 supports hex
 *  only (3-digit, 6-digit, 8-digit-stripped-alpha) — paint chips come
 *  from the 5.10 swatch picker which already produces hex. */
export function normalizePaintColor(input: string): string | null {
  const m = input.trim().toLowerCase();
  const hex = m.startsWith("#") ? m.slice(1) : m;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    const [r, g, b] = hex.split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`;
  return null;
}

export type PaintPreviewResult = {
  url: string;
  /** True if the blob was served from cache (no model spend, no log row). */
  cached: boolean;
  /** Spend snapshot after this render (or after the no-op cache hit). */
  spend: PaintSpendToday;
};

/** Render a paint-preview of one photo at one color. Idempotent on
 *  (photoId, color) — repeat calls with the same inputs return the
 *  cached blob URL at zero cost. Caller is responsible for authz
 *  (assertCanWrite on the photo's project). */
export async function renderPaintPreview(input: {
  photoId: string;
  color: string;
  userId: string;
}): Promise<PaintPreviewResult> {
  const color = normalizePaintColor(input.color);
  if (!color) {
    throw new PaintPreviewError(
      `Could not parse color "${input.color}" — expected hex like #7c9474`,
    );
  }

  const db = getDb();
  const [photo] = await db
    .select({
      id: photos.id,
      projectId: photos.projectId,
      url: photos.url,
      caption: photos.caption,
      captionAi: photos.captionAi,
    })
    .from(photos)
    .where(eq(photos.id, input.photoId));
  if (!photo) throw new PaintPreviewError("Photo not found");

  // Deterministic pathname — same color on the same photo always lands
  // at the same Blob URL. head() check is the cache lookup; allowOverwrite
  // keeps a re-render clean if Blob has the path but our DB lost the row.
  const pathname = `projects/${photo.projectId}/paint/${photo.id}/${color.slice(1)}.png`;

  const cached = await tryHeadBlob(pathname);
  if (cached?.url) {
    return {
      url: cached.url,
      cached: true,
      spend: await getPaintSpendToday(input.userId),
    };
  }

  // Cache miss → cap-gated spend. Count strictly before the model call
  // so a flurry of parallel clicks can't exceed the cap.
  const used = await countTodayRenders(db, input.userId);
  if (used >= PAINT_PREVIEW_CAP_PER_DAY) {
    throw new PaintCapExceededError(used, PAINT_PREVIEW_CAP_PER_DAY);
  }

  const prompt = buildPaintPrompt({
    color,
    caption: photo.caption ?? photo.captionAi ?? null,
  });

  // Mirrors dream.ts: labeled text part right before the image, then
  // the spec. Same provider, same modality, same model — same fail mode
  // if the model returns no image.
  const result = await generateText({
    model: PAINT_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "You're the AI Foreman previewing a paint color. Below is one photo of the user's room today, followed by a spec for the wall color they want to try.",
          },
          {
            type: "text",
            text: `[Image 1] CURRENT STATE — the room as it looks today. PRESERVE EVERYTHING except the wall paint color: lighting, materials, fixtures, floors, ceiling, trim, furniture, the camera angle, the room geometry, and the people if any. CHANGE only the visible wall paint to the exact color in the spec. Match the existing shadows and highlights as if the wall were freshly painted that color under the same lighting.`,
          },
          { type: "image", image: new URL(photo.url) },
          { type: "text", text: `SPEC:\n${prompt}` },
        ],
      },
    ],
    providerOptions: {
      google: {
        responseModalities: ["IMAGE"],
      },
    },
  });

  const imageFile = result.files.find((f) => f.mediaType.startsWith("image/"));
  if (!imageFile) {
    throw new PaintPreviewError(
      `Model returned no image. files=${result.files.length} text=${(result.text ?? "").slice(0, 200)}`,
    );
  }

  const blob = await put(pathname, Buffer.from(imageFile.uint8Array), {
    access: "public",
    contentType: imageFile.mediaType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  // Log the successful render so the cap counts it. Insert AFTER the
  // model + blob succeed — a model error must NOT consume the user's
  // daily quota.
  await db.insert(generationLogs).values({
    projectId: photo.projectId,
    userId: input.userId,
    kind: PAINT_PREVIEW_KIND,
    costEstimateCents: PAINT_PREVIEW_COST_CENTS,
  });

  return {
    url: blob.url,
    cached: false,
    spend: await getPaintSpendToday(input.userId),
  };
}

async function tryHeadBlob(
  pathname: string,
): Promise<{ url: string } | null> {
  try {
    const h = await head(pathname);
    return { url: h.url };
  } catch {
    return null;
  }
}

function buildPaintPrompt(input: {
  color: string;
  caption: string | null;
}): string {
  const lines = [
    `Paint the visible walls in this exact color: ${input.color} (hex).`,
    `Do not change any other surface, finish, or object.`,
    `Keep the camera angle and lighting identical.`,
    `If multiple walls are visible at different angles, paint each with the same color but respect the way light falls on each one.`,
    `Output: one photorealistic image of the same room with only the wall paint changed.`,
  ];
  if (input.caption) {
    lines.push(`Context (do not contradict): ${input.caption}`);
  }
  return lines.join("\n");
}
