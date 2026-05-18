-- Reviewed, idempotent, non-destructive migration (§5).
-- Phase 2: durable Foreman memory + per-thread rolling summary. Purely
-- additive — two new tables, no backfill, no DROP, no change to existing
-- data. Safe to run repeatedly; the §5 pipeline proves this on a throwaway
-- Neon branch before production.

CREATE TABLE IF NOT EXISTS "chat_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "foreman_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_project_id_project_id_fk') THEN
		ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_thread_task_id_task_id_fk') THEN
		ALTER TABLE "chat_thread" ADD CONSTRAINT "chat_thread_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foreman_memory_user_id_user_id_fk') THEN
		ALTER TABLE "foreman_memory" ADD CONSTRAINT "foreman_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_idx" ON "chat_thread" USING btree ("project_id","task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foreman_memory_user_idx" ON "foreman_memory" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foreman_memory_scope_idx" ON "foreman_memory" USING btree ("scope","scope_id");
