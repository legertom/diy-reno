<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations — do not regress

`db:deploy` is the §5 migration-safety pipeline (`scripts/db-deploy.ts`):
snapshot prod → prove the migration non-destructive + idempotent on a
throwaway Neon branch → apply reviewed idempotent SQL to prod → seed →
verify. **Never reintroduce blind `drizzle-kit push --force` for a
structural change against live data.** New schema changes: edit
`src/db/schema.ts`, `drizzle-kit generate`, then hand-review the new
`drizzle/*.sql` into idempotent, non-destructive SQL (the pipeline applies
it). The seeded "Kitchen Renovation" is the owner's real data — treat any
risk to it as data loss. See README §5–§6.
