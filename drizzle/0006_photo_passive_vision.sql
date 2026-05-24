-- Reviewed, idempotent, non-destructive migration (§5).
-- Phase 5.3 Passive AI: every photo runs through one Gemini Flash call
-- on upload that returns the substrate everything from 5.6 onward depends
-- on. Caption / tags / embedding / ROIs / safety all cache on the row so
-- the spend is bounded to "once per upload, never per view."
--
--   - caption_ai           Short factual auto-caption ("North wall, drywall
--                          removed"). Surfaced on the timeline only when
--                          the user hasn't written their own.
--   - tags                 Vision-derived: room kind, surface, materials,
--                          tools, phase. JSONB string array — searchable.
--   - embedding            Vision embedding for same-angle pairing (5.7).
--                          JSON-as-array to stay portable until usage
--                          warrants pgvector.
--   - rois                 5.4 substrate: 3–5 regions of interest with
--                          bbox + category (defect | transition | progress
--                          | moment | safety) + caption + per-ROI
--                          embedding.
--   - safety_flags         Electrical / structural / mold / asbestos /
--                          code-violation cues. JSONB string array with
--                          severity. The lightbox renders these as the
--                          "stop, call a pro" overlay.
--   - vision_completed_at  Sentinel — null = still pending or never run.
--                          Lets the lightbox surface a "Foreman is looking
--                          at this…" state for a moment after upload.
--   - vision_error         Error text from the most recent failed run.
--                          Lets us retry intelligently without losing the
--                          reason for the previous failure.
--
-- All ADD COLUMN IF NOT EXISTS; safe to re-run. The §5 pipeline runs the
-- idempotency gate on a throwaway Neon branch first.

ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "caption_ai" text;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "tags" jsonb;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "embedding" jsonb;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "rois" jsonb;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "safety_flags" jsonb;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "vision_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "vision_error" text;
