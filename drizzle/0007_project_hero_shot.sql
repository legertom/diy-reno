-- Reviewed, idempotent, non-destructive migration (§5).
-- Phase 5.5 Reality-vs-dream loop: the user nominates one photo as
-- "today's view of the room." The home page can then scrub between
-- that photo and the cached dream image, turning the dream from a
-- static poster into a visible journey.
--
--   - hero_shot_photo_id  Nullable FK to photo.id. Set to NULL on
--                         photo delete so the timeline can churn
--                         without breaking the home view.
--
-- ADD COLUMN IF NOT EXISTS + a guarded ADD CONSTRAINT (using the
-- pg_constraint pattern proven in 0002). Safe to re-run; the §5
-- pipeline runs the idempotency gate on a throwaway Neon branch
-- first.

ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "hero_shot_photo_id" text;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'project_hero_shot_photo_id_photo_id_fk'
	) THEN
		ALTER TABLE "project"
		ADD CONSTRAINT "project_hero_shot_photo_id_photo_id_fk"
		FOREIGN KEY ("hero_shot_photo_id")
		REFERENCES "public"."photo"("id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END $$;
