import "server-only";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { photos } from "@/db/schema";
import {
  photoVisionResultSchema,
  type PhotoVisionResult,
} from "@/lib/photo-vision-types";

/** Gemini Flash via Vercel AI Gateway — PHOTO_PLAN.md §5 Q4.
 *  Cheap multimodal pass: caption / tags / ROIs / safety in one call.
 *  Override with VISION_MODEL if Tom ever wants to swap.
 *
 *  Phase 5.7 wires a second cheap call (text-embedding-004 over the
 *  caption + tags + ROI captions) right after the vision update lands.
 *  Embedding failure does NOT fail the whole vision pass — the photo
 *  still gets caption/tags/ROIs even if the embedding step trips. */
const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

const SYSTEM = `You are the same warm-honest Foreman the user already chats with — a friend who's done a lot of these jobs and isn't shy about saying "stop, call a licensed pro" when the work is over their head. Look at one renovation photo and return five things:

1. A short factual caption (one sentence, <120 chars). Describe what you see, not what you feel. Example: "North wall, drywall removed; studs and old wiring exposed."
2. Up to 12 lowercase tags drawn from these axes: room kind (kitchen, bath, bedroom…), surface (drywall, tile, plaster, hardwood…), materials present (carrara, oak, brass, schluter…), tools visible (jigsaw, level, mortar mixer…), and phase (demo, rough-in, prep, finish, punch). One word or short hyphenated phrase per tag.
3. 3–5 regions of interest (ROIs). For each: a normalized bounding box (x,y,w,h in 0..1), a category — defect / transition / progress / moment / safety — and a one-line "what the Foreman saw" caption. Be conservative: false negatives are better than false positives. Skip the photo entirely if nothing draws the eye.
4. Safety flags — anything the user might be about to do unsafely or anything already unsafe in the frame. Cover electrical, structural, mold, asbestos, code-violation, fall-hazard. Each gets kind, severity (info|warn|stop), detail, and a recommendation. "stop" severity is the "stop, call a pro" overlay. Leave the array empty when nothing rises to that bar.
5. An embedding — leave this as an empty array for now; same-angle pairing isn't wired yet.

Tone is warm and honest. Don't invent details you can't see. Don't moralize. Don't pretend to know dimensions or distances. If the photo is a receipt or a screenshot rather than the work itself, set caption + tags accordingly and return empty rois + safetyFlags.`;

export class VisionError extends Error {}

/** Run the single Gemini Flash vision pass for one photo and persist
 *  the results. Idempotent — re-running overwrites cached fields and
 *  clears the previous error. Server-only; caller handles authz. */
export async function runVisionOnPhoto(photoId: string): Promise<void> {
  const db = getDb();
  const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!photo) throw new VisionError("Photo not found");

  try {
    const { output } = await generateText({
      model: VISION_MODEL,
      experimental_output: Output.object({ schema: photoVisionResultSchema }),
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: photo.caption
                ? `Existing user caption: ${photo.caption}`
                : "Photo from the renovation timeline.",
            },
            { type: "image", image: new URL(photo.url) },
          ],
        },
      ],
    });

    const parsed: PhotoVisionResult = output;
    await db
      .update(photos)
      .set({
        captionAi: parsed.caption,
        tags: parsed.tags,
        // Embedding is computed below from the freshly-written caption
        // + tags + ROIs; the LLM-returned embedding (always empty) is
        // ignored. Leaving the column null here so a failed embedPhoto
        // call doesn't strand a stale value.
        embedding: null,
        rois: parsed.rois,
        safetyFlags: parsed.safetyFlags,
        visionCompletedAt: new Date(),
        visionError: null,
      })
      .where(eq(photos.id, photoId));

    // Phase 5.7: same-angle pairing producer. Best-effort — a
    // text-embedding-004 failure shouldn't fail the whole vision pass
    // (the caption/tags/ROIs are already saved and useful on their own).
    try {
      const { embedPhoto } = await import("@/lib/photo-embeddings");
      await embedPhoto(photoId);
    } catch (e) {
      console.warn(
        "[5.7] embedPhoto failed; vision pass still succeeded:",
        e,
      );
    }
  } catch (e) {
    const message = (e as Error).message || "vision failed";
    await db
      .update(photos)
      .set({ visionError: message.slice(0, 1000) })
      .where(eq(photos.id, photoId));
    // Re-throw so the caller can surface (Tom is debugging the first
    // few; later we'll add a retry queue).
    throw new VisionError(message);
  }
}
