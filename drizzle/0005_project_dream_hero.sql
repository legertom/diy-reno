-- Reviewed, idempotent, non-destructive migration (§5).
-- Phase 5.2 Dream hero: the AI render of the kitchen-to-be becomes the
-- project's home-screen hero. Cached per project (zero per-view AI spend);
-- re-rendered only on explicit dreamTriggers (PHOTO_PLAN.md §5 Q3).
--
--   - style_profile        Shape locked in PHOTO_PLAN.md §5 Q2. Populated
--                          by the Phase 4 intake interview and editable
--                          from the "why this image?" affordance.
--   - dream_image_url      Public Blob URL of the latest cached render.
--   - dream_pathname       Blob pathname kept alongside the URL so we can
--                          del() the old asset when a re-render replaces
--                          it (Blob has no orphan cleanup — same lesson as
--                          the photo path).
--   - dream_prompt         The exact prompt that produced the cached
--                          image — feeds the "why this image?" panel and
--                          gives Tom an audit trail.
--   - dream_rendered_at    When the cached image was generated. Used by
--                          the dreamTriggers cooldown to avoid flicker.
--
-- All ADD COLUMN IF NOT EXISTS; safe to re-run. The §5 pipeline runs the
-- idempotency gate on a throwaway Neon branch first.

ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "style_profile" jsonb;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "dream_image_url" text;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "dream_pathname" text;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "dream_prompt" text;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "dream_rendered_at" timestamp with time zone;
