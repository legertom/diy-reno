-- Reviewed, idempotent, non-destructive migration (§5).
-- Phase 5.11 v0 paint preview: per-call audit trail + server-side cap
-- enforcement. One row per successful Gemini 2.5 Flash Image render.
-- The cap query (renderPaintPreview) counts rows for
-- (user_id, kind, today UTC); if >= cap (5/day, BLOCKED.md Resolution
-- 2026-05-26, Tom option 1), the action refuses BEFORE spending so the
-- user always lands in a friendly "back tomorrow" state, never a 500.
--
--   - project_id            Cascade on project delete (per-project audit
--                           naturally goes with the project).
--   - user_id               Cascade on user delete (a deleted user
--                           shouldn't leave orphaned spend rows).
--   - kind                  'paint_preview' today; forward-compatible so
--                           any future §5.11 variant (parked behind a
--                           second Tom decision) can share the cap
--                           infrastructure.
--   - cost_estimate_cents   Per-row so a future variant with a heavier
--                           prompt (product insertion ~1.5x) records
--                           correctly. ~4 cents for paint_preview today.
--   - created_at            Default now(); the cap query filters by this.
--
-- Purely additive — new table, two FKs, two indexes. No backfill, no
-- DROP, no change to existing data. Each statement guarded so re-running
-- is a no-op; the §5 pipeline runs the idempotency gate on a throwaway
-- Neon branch BEFORE production sees this.

CREATE TABLE IF NOT EXISTS "generation_log" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"cost_estimate_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_log_project_id_project_id_fk') THEN
		ALTER TABLE "generation_log" ADD CONSTRAINT "generation_log_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_log_user_id_user_id_fk') THEN
		ALTER TABLE "generation_log" ADD CONSTRAINT "generation_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_log_user_kind_idx" ON "generation_log" USING btree ("user_id","kind","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_log_project_idx" ON "generation_log" USING btree ("project_id","created_at");
