-- Reviewed, idempotent, non-destructive migration (§5).
-- Adds the structured "spec-sheet" brief alongside the existing free-text
-- brief. Purely additive — one nullable JSONB column on "project". The text
-- "brief" column is retained as the Foreman chat prompt's source of truth
-- (the polish API writes both columns in sync), and as the fallback render
-- for any project that hasn't been re-polished into the new shape yet.
--
-- Safe to run repeatedly: IF NOT EXISTS guards the column add and no
-- existing data is touched.

ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "brief_structured" jsonb;
