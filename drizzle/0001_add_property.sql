-- Reviewed, idempotent, non-destructive migration (§5).
-- Introduces Property as the parent of Project and backfills existing live
-- data. Every statement is safe to run repeatedly: the §5 deploy pipeline
-- proves this on a throwaway Neon branch before it ever touches production.
-- Purely additive — no DROP, no destructive ALTER, no data deletion.

CREATE TABLE IF NOT EXISTS "property" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"ownership" text,
	"location" text,
	"floor_plan_url" text,
	"rooms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "property_id" text;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_owner_id_user_id_fk') THEN
		ALTER TABLE "property" ADD CONSTRAINT "property_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_property_id_property_id_fk') THEN
		ALTER TABLE "project" ADD CONSTRAINT "project_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_owner_idx" ON "property" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_property_idx" ON "project" USING btree ("property_id");
--> statement-breakpoint
-- Backfill: one Property per owner that still has unparented projects, then
-- nest those projects under it. Idempotent (NOT EXISTS / IS NULL guards) and
-- non-destructive (only INSERTs new rows and fills NULLs — never updates real
-- project data, never deletes). The owner can rename this Property in the UI.
INSERT INTO "property" ("id", "owner_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, u."id", 'My place', now(), now()
FROM "user" u
WHERE EXISTS (
		SELECT 1 FROM "project" p
		WHERE p."owner_id" = u."id" AND p."property_id" IS NULL
	)
	AND NOT EXISTS (
		SELECT 1 FROM "property" pr WHERE pr."owner_id" = u."id"
	);
--> statement-breakpoint
UPDATE "project" p
SET "property_id" = (
		SELECT pr."id" FROM "property" pr
		WHERE pr."owner_id" = p."owner_id"
		ORDER BY pr."created_at" ASC, pr."id" ASC
		LIMIT 1
	)
WHERE p."property_id" IS NULL
	AND EXISTS (
		SELECT 1 FROM "property" pr WHERE pr."owner_id" = p."owner_id"
	);
