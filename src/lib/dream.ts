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

  // Collect grounding images:
  //   1. Hero shot (Tom's "this is what the room looks like today")
  //   2. Up to 2 of the most recent room photos that aren't the hero
  //   3. styleProfile.referenceImages (inspiration the user pasted in)
  // Cap the total — too many image inputs dilute the signal AND
  // multiply token cost on Nano Banana.
  const groundingUrls: string[] = [];
  if (project.heroShotPhotoId) {
    const [hero] = await db
      .select({ url: photos.url })
      .from(photos)
      .where(eq(photos.id, project.heroShotPhotoId));
    if (hero?.url) groundingUrls.push(hero.url);
  }
  const recent = await db
    .select({ id: photos.id, url: photos.url })
    .from(photos)
    .where(eq(photos.projectId, projectId))
    .orderBy(desc(photos.takenAt), desc(photos.createdAt))
    .limit(6);
  for (const p of recent) {
    if (groundingUrls.length >= 3) break;
    if (p.id === project.heroShotPhotoId) continue;
    groundingUrls.push(p.url);
  }
  const refImages = styleProfile?.referenceImages ?? [];
  for (const url of refImages) {
    if (groundingUrls.length >= 5) break;
    groundingUrls.push(url);
  }

  const prompt = buildDreamPrompt({
    projectTitle: project.title,
    brief: project.brief,
    styleProfile,
    hasRoomPhotos: groundingUrls.length > 0,
    refImageCount: refImages.length,
  });

  // Gemini 2.5 Flash Image (Nano Banana) is a *language* model in the
  // gateway taxonomy that emits images. Invoke via generateText with
  // multipart messages (text + image parts) and the IMAGE response
  // modality. Image arrives in result.files.
  const result = await generateText({
    model: DREAM_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...groundingUrls.map(
            (u) =>
              ({
                type: "image" as const,
                image: new URL(u),
              }) as const,
          ),
        ],
      },
    ],
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
