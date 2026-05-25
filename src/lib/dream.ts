import "server-only";
import { generateText } from "ai";
import { put, del } from "@vercel/blob";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, photos } from "@/db/schema";
import { buildDreamPrompt, type StyleProfile } from "@/lib/style-profile";

/** Dream-hero render: locked to Gemini 2.5 Flash Image (PHOTO_PLAN.md
 *  §5 Q1, "Nano Banana"). Goes through Vercel AI Gateway — in prod the
 *  project's OIDC token handles auth, locally AI_GATEWAY_API_KEY is set.
 *  Override via env (`DREAM_MODEL`) without a code change. Candidates
 *  worth trying when 2.5 underwhelms (per the §5.2 post-20-render
 *  quality audit):
 *    - google/gemini-3.1-flash-image-preview  (newer, preview tier)
 *    - bfl/flux-kontext-pro                   (PHOTO_PLAN's named fallback) */
const DREAM_MODEL = process.env.DREAM_MODEL || "google/gemini-2.5-flash-image";

export class DreamRenderError extends Error {}

type ProjectRow = typeof projects.$inferSelect;

export type DreamRenderResult = {
  url: string;
  pathname: string;
  renderedAt: Date;
  prompt: string;
};

/** Render the dream hero for a project and cache it to Blob.
 *  Server-only. Caller is responsible for authz (assertCanWrite).
 *
 *  Grounds on the user's actual room: passes the hero shot (if set),
 *  the most recent project photos, and any `styleProfile.referenceImages`
 *  as image inputs alongside the prompt. Nano Banana is multimodal —
 *  this is what makes "room preservation reasonable" (PHOTO_PLAN.md
 *  §5 Q1) actually true. Without grounding, the model invents an
 *  entire room from scratch (this was the bug in the first cut). */
export async function renderDreamHero(
  projectId: string,
): Promise<DreamRenderResult> {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) throw new DreamRenderError("Project not found");

  const styleProfile = (project.styleProfile as StyleProfile | null) ?? null;

  // Collect grounding images, in priority order. Each one gets a
  // labeled text part RIGHT BEFORE it in the prompt so Nano Banana
  // knows which image is which role (today's state vs inspiration).
  // Without the labels the model just sees a pile of images and
  // averages them — exactly the failure mode in the first cut.
  type Grounding = {
    url: string;
    role: "today-hero" | "today-context" | "inspiration";
  };
  const grounding: Grounding[] = [];

  if (project.heroShotPhotoId) {
    const [hero] = await db
      .select({ url: photos.url })
      .from(photos)
      .where(eq(photos.id, project.heroShotPhotoId));
    if (hero?.url) grounding.push({ url: hero.url, role: "today-hero" });
  }
  const recent = await db
    .select({
      id: photos.id,
      url: photos.url,
      captionAi: photos.captionAi,
      tags: photos.tags,
    })
    .from(photos)
    .where(eq(photos.projectId, projectId))
    .orderBy(desc(photos.takenAt), desc(photos.createdAt))
    .limit(8);
  for (const p of recent) {
    if (grounding.length >= 3) break;
    if (p.id === project.heroShotPhotoId) continue;
    // Skip obvious non-room photos so we don't ground on a receipt or
    // a paint chip. Conservative: if the AI caption *or* a tag mentions
    // one of these, skip; otherwise include.
    const haystack = [
      p.captionAi ?? "",
      ...(p.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    if (
      haystack.includes("receipt") ||
      haystack.includes("screenshot") ||
      haystack.includes("paint chip") ||
      haystack.includes("swatch")
    ) {
      continue;
    }
    // If we don't have a hero shot, the first eligible photo BECOMES
    // the today-hero so the model has one strong anchor.
    const role =
      grounding.some((g) => g.role === "today-hero")
        ? "today-context"
        : "today-hero";
    grounding.push({ url: p.url, role });
  }
  const refImages = styleProfile?.referenceImages ?? [];
  for (const url of refImages) {
    if (grounding.length >= 5) break;
    grounding.push({ url, role: "inspiration" });
  }

  const hasRoomPhotos = grounding.some(
    (g) => g.role === "today-hero" || g.role === "today-context",
  );
  const refImageCount = grounding.filter((g) => g.role === "inspiration").length;

  const prompt = buildDreamPrompt({
    projectTitle: project.title,
    brief: project.brief,
    styleProfile,
    hasRoomPhotos,
    refImageCount,
  });

  // Per-image labels. The structure is: leading framing text, then for
  // each image a one-line role caption immediately followed by the
  // image, then the spec block. Nano Banana respects this ordering for
  // attribution.
  const content: (
    | { type: "text"; text: string }
    | { type: "image"; image: URL }
  )[] = [];
  const intro = grounding.length
    ? `You're the AI Foreman rendering a hero image for a project home page. The user has attached ${grounding.length} photo${grounding.length === 1 ? "" : "s"} — each is labeled below. Read every label before you compose the image.`
    : `You're the AI Foreman rendering a hero image for a project home page.`;
  content.push({ type: "text", text: intro });

  let idx = 0;
  for (const g of grounding) {
    idx++;
    const label =
      g.role === "today-hero"
        ? `[Image ${idx}] CURRENT STATE — this is the room as it looks TODAY. PRESERVE: the layout, the wall positions, the window placement, the doorways, the ceiling height, the room proportions, and a similar camera angle. CHANGE: surfaces and finishes per the spec at the end. Render this same room renovated, not a different room.`
        : g.role === "today-context"
          ? `[Image ${idx}] ADDITIONAL VIEW of the same room today — use it for context on what to preserve. Same room as the CURRENT STATE image.`
          : `[Image ${idx}] INSPIRATION REFERENCE — pull color, material, and style cues from this image. DO NOT copy its layout, room shape, or framing. It's a vibe reference, not the target room.`;
    content.push({ type: "text", text: label });
    content.push({ type: "image", image: new URL(g.url) });
  }

  content.push({ type: "text", text: `SPEC:\n${prompt}` });

  const result = await generateText({
    model: DREAM_MODEL,
    messages: [{ role: "user", content }],
    providerOptions: {
      google: {
        responseModalities: ["IMAGE"],
      },
    },
  });

  const imageFile = result.files.find((f) =>
    f.mediaType.startsWith("image/"),
  );
  if (!imageFile) {
    throw new DreamRenderError(
      `Model returned no image. files=${result.files.length} text=${(result.text ?? "").slice(0, 200)}`,
    );
  }

  const ext = imageFile.mediaType.split("/")[1] || "png";
  const stamp = Date.now();
  const pathname = `projects/${projectId}/dream/${stamp}.${ext}`;
  const blob = await put(pathname, Buffer.from(imageFile.uint8Array), {
    access: "public",
    contentType: imageFile.mediaType,
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  const renderedAt = new Date();
  await db
    .update(projects)
    .set({
      dreamImageUrl: blob.url,
      dreamPathname: blob.pathname,
      dreamPrompt: prompt,
      dreamRenderedAt: renderedAt,
    })
    .where(eq(projects.id, projectId));

  // Clean up the previous cached asset — Blob has no orphan sweep.
  // Best-effort: a failure here leaks bytes but doesn't break the new
  // render that's already live.
  if (project.dreamPathname && project.dreamPathname !== blob.pathname) {
    try {
      await del(project.dreamPathname);
    } catch (e) {
      console.warn(
        "[dream] failed to del previous Blob",
        project.dreamPathname,
        e,
      );
    }
  }

  return {
    url: blob.url,
    pathname: blob.pathname,
    renderedAt,
    prompt,
  };
}

/** Cooldown gate per PHOTO_PLAN.md §5 Q3: re-renders shouldn't flicker.
 *  Manual button bypasses (force=true); style-profile-change-driven
 *  renders honor this. */
export const DREAM_COOLDOWN_MS = 60_000;

export function dreamIsInCooldown(project: Pick<ProjectRow, "dreamRenderedAt">) {
  if (!project.dreamRenderedAt) return false;
  return Date.now() - project.dreamRenderedAt.getTime() < DREAM_COOLDOWN_MS;
}
