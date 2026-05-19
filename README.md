# DIY Reno

A renovation planner with an agentic AI "Foreman." Plan a job as **phases →
ordered tasks** (no dates), check tasks off, log hours, keep a buy list, snap
photos, and run the *entire* project by chatting with a renovation-expert AI
that can actually mutate your data. Share a project with collaborators.

Mobile-first. Visual language: architect's-blueprint chrome over light
"drawing-sheet" content. Live at `https://diy-reno.vercel.app`.

> This README is written so another engineer or AI agent can work on the app
> without re-discovering the hard-won decisions. Read **§7 Gotchas** before
> changing data access, styling, deploy, or the Foreman.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, RSC) · React 19 · TypeScript |
| Styling | Tailwind v4 (CSS-first `@theme` in `globals.css`) |
| Type | **Geist** only (one geometric family; via the `geist` package) |
| Auth | Auth.js v5 (`next-auth@beta`) — Google only, DB sessions, `@auth/drizzle-adapter` |
| DB | Neon Postgres (Vercel Marketplace) + Drizzle ORM (`drizzle-orm/neon-http`) |
| Files | Vercel Blob (client uploads) |
| AI | Vercel AI SDK v6 (`ai`, `@ai-sdk/react`) via **Vercel AI Gateway** |
| Deploy | Vercel, Git integration (push `main` → prod) |

Model: string `anthropic/claude-sonnet-4.6` (override with `AI_MODEL`). On
Vercel the Gateway authenticates via the project's OIDC token — no
`AI_GATEWAY_API_KEY` needed in prod; set it only for local dev.

## 2. Run locally

```bash
npm install
cp .env.example .env.local            # fill in (see below)
npm run db:push                       # create tables (uses unpooled URL)
npm run db:seed                       # seed Kitchen Renovation (idempotent)
npm run dev
```

`db:push`/`db:seed`/`db:studio`/`db:generate` use `dotenv-cli` to load
`.env.local` (drizzle-kit/tsx don't read it automatically). They prefer
`DATABASE_URL_UNPOOLED` over `DATABASE_URL` (Neon's pooled pgbouncer
endpoint breaks drizzle-kit DDL).

### Env vars (`.env.example`)

- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Neon. Provisioned by the Vercel
  Neon integration; **marked Sensitive in Vercel, so `vercel env pull` returns
  them blank.** That's why migrations/seed run in the Vercel build (see §6).
- `NEON_API_KEY` / `NEON_PROJECT_ID` — used **only by the deploy build** (§6)
  for the §5 migration-safety pipeline: it snapshots prod and gates the
  migration on a throwaway Neon branch before touching live data. Set both in
  the Vercel project env (Production). `NEON_PROJECT_ID` is auto-injected by
  the Neon integration; `NEON_API_KEY` is a personal Neon API key you add.
- `AUTH_SECRET` — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth web client.
  Redirect URI: `https://<domain>/api/auth/callback/google` (+ localhost).
- `AI_GATEWAY_API_KEY` — local dev only (prod uses OIDC).
- `AI_MODEL` — optional model override.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob; auto on Vercel, needed locally.

## 3. Architecture

### Routes (`src/app`)

- `page.tsx` — dashboard: project list + create.
- `signin/page.tsx` — Google sign-in (only page with no `AppHeader`/bubble).
- `p/[projectId]/page.tsx` — project: blueprint header, **Project brief** card,
  Foreman entry, Next-up, phases (`SectionHeader` + `TaskRow`s). No tabs/dates.
- `p/[projectId]/foreman/page.tsx` — project-level Foreman chat.
- `p/[projectId]/t/[taskId]/page.tsx` — task: status, "Edit task & plan"
  (`TaskEditor`), the guide, per-task Foreman, photos, time, notes, buy list.
- `p/[projectId]/settings/page.tsx` — collaborators.
- `api/auth/[...nextauth]` — Auth.js handlers.
- `api/chat` — **the Foreman** (streaming, tools). `taskId` optional.
- `api/chat/history` — GET project-level thread (for the bubble).
- `api/upload` — Vercel Blob client-upload token (`handleUpload`).
- `api/identify-tools` — vision: photo → tool names (`generateText` + `Output.object`).
- `api/polish-brief` — text: messy description → structured brief.

### Data layer

- `src/db/schema.ts` — Drizzle, `casing: "snake_case"`. Entity model is
  **User → Property → Project → Phase → Task**: a `property` is the physical
  place (entered once, reused by every project on it); `project.property_id`
  is a nullable FK (`on delete set null`) so introducing Property was a
  non-destructive migration. Tables: Auth.js
  (`user`,`account`,`session`,`verificationToken`), `property`, `project`,
  `project_member`, `phase`, `task`, `task_guide`, `note`, `shopping_item`,
  `time_log`, `photo`, `chat_message`, `chat_thread` (per-thread rolling
  summary for compaction), `foreman_memory` (durable Foreman memory, scoped
  user/property/project), `user_tool`. Enums: `member_role`,
  `task_status` (todo|in_progress|done), `chat_role`.
  **There is no schedule/date model** (removed by design).
  **Sharing/authz stay at the project level** — Property is purely the
  organizing parent and has no collaborator roles of its own.
- `src/db/index.ts` — `getDb()` lazy singleton. **Plain `let`, never a
  `Proxy`** (a Proxy breaks Auth.js adapter introspection).
- `src/lib/projects.ts` — `server-only` queries + authz: `requireUser`,
  `getAccess`/`canWrite`, `assertCanWrite`, `assertOwnsProperty`
  (Property writes are owner-only), `getProjectOr404`, `getBoard` (phases by
  `position` → tasks by `position`, + orphans + progress), `computeNextUp`
  (first non-done in that order), `getTaskDetail`, `getTaskChat`,
  `getProjectChat`, `getMembers`, `getUserTools`, `listProjectsForUser`
  (each project carries its `property` for grouping).
- `src/app/actions.ts` — all deterministic mutations (server actions),
  project mutations gated by `assertCanWrite`, Property edits by
  `assertOwnsProperty`; `createProject` nests new projects under a Property.
  Used by the UI editors.

### Auth

`src/auth.ts` uses the **lazy config form**: `NextAuth(() => ({...}))`.
This defers `getDb()`/adapter creation to request time so `next build`
never opens a DB connection. Google has `allowDangerousEmailAccountLinking:
true` so a seeded user row links to the real Google login by email
(safe: single, email-verified provider). Pages call `requireUser()`
(React-cached) — there is **no middleware/proxy**; authz is in
RSC/actions.

## 4. The Foreman (most important subsystem)

One route, `src/app/api/chat/route.ts`, drives every chat (per-task,
project page, and the global bubble). Client: `src/components/task/
task-chat.tsx` (`useChat` + `DefaultChatTransport`, multimodal, reused
everywhere; `taskId` may be `null`).

- **Modes:** `taskId` present → task mode (task context + task-scoped
  tools). `taskId` null → project Foreman (planning; task-scoped tools
  politely defer).
- **System prompt** is assembled per request: persona + `ABOUT THIS
  PROJECT` (title/summary/**brief**) + **WHAT YOU REMEMBER** (durable
  `foreman_memory` in scope) + **EARLIER IN THIS CONVERSATION** (the
  thread's rolling summary) + owned tools + phases + full task list
  (current order) + current task context *or* project-mode note.
- **Tools** (all writes wrapped in `commit()` which only reports `ok:true`
  if the DB write actually succeeded — prevents the model claiming
  unfulfilled changes). `denied` if not writable; `noTask` if a
  task-scoped tool is used with no task:
  - Project-wide: `setProjectBrief`, `updateProjectDetails`, `addTask`,
    `moveTask`, `deleteTask`, `moveTaskToPhase`, `movePhase`,
    `renamePhase`, `mergePhases`, `deletePhase`, `recordOwnedTool`,
    `remember` / `forget` (durable memory, scoped user/property/project;
    project/property scope is write-gated, user scope is the caller's own).
  - Task-scoped: `setTaskStatus`, `updateTaskGuide`, `editTaskDetails`,
    `addNote`, `addBuyItem`, `logTime`.
- **Memory vs. transcript:** `foreman_memory` is durable and survives
  resets; the transcript is disposable. **"Start fresh"**
  (`resetForemanThread`, write-gated, button in `task-chat.tsx`) clears
  `chat_message` + `chat_thread.summary` for the thread but never
  `foreman_memory` — the character is not amnesiac after a reset.
- **Persistence + compaction:** `onFinish` keeps the last `KEEP_LAST`(12)
  turns verbatim in `chat_message`; once a thread exceeds 12+`COMPACT_BATCH`
  (8), one cheap `generateText` folds the batch rolling out of the window
  into `chat_thread.summary` (merge, no duplicate/loss). The model only
  ever sees the last 12 turns + summary + memory, so per-turn cost is
  bounded (no more replaying the whole transcript). Keyed by `taskId`, or
  `taskId IS NULL` for the project thread. Client refreshes via
  `useChat({ onFinish: () => router.refresh() })`.
- **UI feedback:** tool result parts render as chips via `TOOL_LABELS`
  in `task-chat.tsx` — add an entry when you add a tool.
- **Adding a tool:** add `tool({...})` in the route (mind project vs
  task-scoped guards), update the `ACTIONS:` line in the system prompt,
  add a `TOOL_LABELS` entry. Resolve tasks by `#num`, phases by name via
  `findPhase`. Query phases fresh (`freshPhases()`) inside phase tools so
  chained calls in one turn don't use a stale snapshot.

Global bubble: `foreman-launcher.tsx` (server: lists projects) →
`foreman-bubble.tsx` (client FAB; auto-scopes to the lone project or a
picker; loads history from `/api/chat/history`). Mounted from
`AppHeader`, so it's on every authed page.

## 5. Design system

Everything is tokens/utilities in `src/app/globals.css` `@theme` —
restyle there, not per-component. Direction = **"evolve the blueprint"**
(Phase 3): high-end editorial — warm paper, near-black ink, hairline
rules, generous space, one geometric family (**Geist**, via the `geist`
package) across a dramatic scale. **Token names are unchanged on purpose**
so every component re-skins at once and the `cn()` color list in
`src/lib/utils.ts` stays in lockstep (README §7.1) — only the values
moved. `brass*` is a legacy name now pointing at the restrained deep-navy
accent; **deep navy is rare punctuation, never the default surface.**
The one surviving architectural signature is `.dim-rule` (hairline +
end-ticks) plus the rigorous numeral system; the skeuomorphic chrome
(drafting grid, `.sheet-frame`, `.tick-corners`/`.ticked`, `.hatch`, the
`◳` wordmark, "Sheet A-2"/"Dossier" codes) was removed. Live utilities:
`.dim-rule`, `.eyebrow`(+`.eyebrow-brass`), `.sheet-no`, `.font-display`,
`.blueprint-surface` (calm deep-navy block — rare; sign-in cover).
Shared primitives in `src/components/ui.tsx` (`Card` — `frame`/`ticked`
kept as no-op-ish props for call-site compatibility — `SectionHeader`,
`Badge`, `Button`, `ProgressBar`, `Eyebrow`, `EmptyState`). The Foreman
is a **persistent bottom-anchored surface** (thumb zone), not a corner
icon — `foreman-bubble.tsx`.

## 6. Deploy

Git integration: push to `main` → Vercel builds production. `vercel.json`
sets `buildCommand: "npm run db:deploy && npm run build"`. **`db:deploy` is
now the §5 migration-safety pipeline (`scripts/db-deploy.ts`), not blind
`drizzle-kit push --force`.** Per deploy, in order: (1) snapshot prod into a
recorded Neon branch (`presnapshot-…`, the rollback target); (2) clone a
throwaway Neon branch and apply the reviewed migration **twice**, asserting
it is non-destructive + idempotent — **if this gate fails the deploy aborts
before production is touched**; (3) apply the reviewed idempotent SQL in
`drizzle/` to prod (no `push --force`); (4) run the idempotent seed; (5)
verify prod (live project intact, owned correctly, nested under its
Property). Any failure exits non-zero so the build fails and nothing ships;
rollback = restore the logged snapshot branch. Requires `NEON_API_KEY` +
`NEON_PROJECT_ID` in the build env. The seed remains **idempotent and
non-destructive** (skips if "Kitchen Renovation" exists; `SEED_FORCE=1` to
force). Schema changes are now **generated + reviewed** SQL migrations
(`drizzle-kit generate` → hand-reviewed idempotent SQL); never reintroduce
blind `push --force` for a structural change against live data.

CLI is authed as `legertom`, scope `legertoms-projects`, prod alias
`diy-reno.vercel.app`. Use `vercel inspect <url> --logs` and `vercel
logs`. (The Vercel MCP connector is 403 for this scope — use the CLI.)

```bash
vercel ls                              # find latest deployment
vercel inspect <url> --logs            # build logs
```

## 7. Gotchas (read before editing)

1. **`cn()` is an extended tailwind-merge** (`src/lib/utils.ts`). It
   registers every custom color token. **If you add a color token to
   `@theme`, add its name to the `color` list there too** — otherwise
   tailwind-merge treats `text-<token>` and `text-sm` as the same group
   and strips the color (caused the "can't read" bug; elements then
   inherit the blueprint header's pale text).
2. **Form fields:** `globals.css` forces dark text + readable
   placeholders on all `input/textarea/select`. Don't rely on inherited
   color (pages under `.blueprint-surface` inherit pale text).
3. **DB client:** lazy `let`, never `Proxy`. **Auth.js:** lazy config
   function form. Both keep `next build` from touching the DB.
4. **Sensitive env vars** can't be `vercel env pull`'d → that's why
   migrations/seed live in the build (`db:deploy`). Don't try to "fix"
   this by pulling env locally.
5. **Neon pooled vs unpooled:** runtime uses pooled `DATABASE_URL`
   (neon-http); drizzle-kit/seed use `DATABASE_URL_UNPOOLED` first.
6. **LLM optional args** can arrive as `""`. Treat blank as absent
   (see `moveTask`/`movePhase`). `??` does **not** catch `""`.
7. **`commit()`** in the chat route is the honesty boundary — never
   return `ok:true` for a write that didn't run. Keep new tools inside it.
8. `react-markdown` (not "AI Elements") renders assistant text — a
   deliberate, safe choice; an ESLint hook suggests otherwise, ignore it.
9. ESLint `react-hooks/set-state-in-effect`: don't `setState`
   synchronously at the top of an effect (see `foreman-bubble.tsx`).
10. Minor known nit: a task page renders both the inline task chat and
    the global bubble (two `id="foreman"`). Harmless; fix by making the
    id unique if it ever matters.

## 8. Roadmap / not done

- **Migrations**: ✅ moved off blind `drizzle-kit push --force` to
  generated + reviewed idempotent SQL applied by the §5 pipeline
  (`scripts/db-deploy.ts`, see §6). Future structural changes:
  `drizzle-kit generate` → review/make idempotent → the pipeline applies
  it (snapshot + branch idempotency gate first). `drizzle/0000_baseline.sql`
  is the diff baseline only and is never executed.
- **AI plan generation** (phase 2): describe a project → Foreman
  scaffolds phases/tasks. Good fit for Vercel Workflow `DurableAgent`
  (long, resumable). Per-step chat is separate.
- Voice = device dictation into the chat box (no in-app STT).
- The Claude Code `vercel-plugin` update is a user-side `/plugin` action;
  nothing in the app depends on it.
