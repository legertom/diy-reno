-- Reviewed, idempotent, non-destructive migration (§5).
-- Phase 5.1 Foundation: photo carries the bits the timeline + Foreman need.
--   - taken_at      EXIF capture moment (nullable; falls back to created_at
--                   in queries). Indexed for chronological timeline scans.
--   - orientation   EXIF Orientation tag (1–8). Display-time hint; nullable.
--   - room_name     Free-text room reference. Rooms today live as JSONB
--                   names on Property (schema.ts:121); a name match keeps
--                   this additive — no FK to a rooms table that doesn't
--                   exist. Constrained in the UI (chooser pulls from the
--                   project's Property rooms list).
--   - position      Manual order on the project timeline. Existing rows
--                   default to 0; the timeline secondary-sorts by takenAt
--                   then createdAt, so a zero-position tie behaves like
--                   the pre-migration ordering.
--
-- All ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. Safe to
-- re-run; the §5 pipeline proves this on a throwaway Neon branch before
-- production is touched.

ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "taken_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "orientation" integer;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "room_name" text;
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_taken_at_idx" ON "photo" ("taken_at");
