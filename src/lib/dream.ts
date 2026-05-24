import "server-only";
import { generateText } from "ai";
import { put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { buildDreamPrompt, type StyleProfile } from "@/lib/style-profile";

/** Dream-hero render: locked to Gemini 2.5 Flash Image (PHOTO_PLAN.md
 *  §5 Q1). Goes through Vercel AI Gateway — in prod the project's OIDC
 *  token handles auth, locally AI_GATEWAY_API_KEY is set. Override via
 *  env (`DREAM_MODEL`) for the named FLUX Kontext fallback if the
 *  post-20-render audit ever requires it. */
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
 *  Server-only. Caller is responsible for authz (assertCanWrite). */
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
  const prompt = buildDreamPrompt({
    projectTitle: project.title,
    brief: project.brief,
    styleProfile,
  });

  // Gemini 2.5 Flash Image (Nano Banana) is a *language* model in the
  // gateway taxonomy that emits images — invoke via generateText with
  // the IMAGE response modality. Image arrives in result.files.
  const result = await generateText({
    model: DREAM_MODEL,
    prompt,
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
