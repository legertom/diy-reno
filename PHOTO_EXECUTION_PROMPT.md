# Photo Phase Execution Prompt

> **Read this once, then operate from it.** You are a fresh Claude
> Code agent (Opus 4.7) starting at the project root of DIY Reno with
> no memory of prior conversations. Your job is to execute the
> **post-overnight-run continuation** described in §3 below. The
> previous run (2026-05-24) shipped 5.1 through 5.10 v0 across 11
> merged PRs; see `PHOTO_PLAN.md` top of file for the handoff and
> `BLOCKED.md` for the resolved §5.11 question. **All seven §5 open
> questions and the 5.11 cost gate are now pre-resolved.** This
> document is your operating contract. The owner is Tom
> (tomleger@gmail.com). **Tom is asleep when you run.** If you would
> normally ask him, follow §6 instead.
>
> Rev. 4 — 2026-05-26. **5.11 paint preview unlocked** (option 1, cap
> = 5 renders/day, ~$6/mo). Other §5.11 variants remain hard-stopped.

---

## 0. Orient before doing anything else

**Read these, in this order, before any tool call beyond initial reads:**

1. `AGENTS.md` — the hardest constraints (this is not the Next.js in
   your training data; read `node_modules/next/dist/docs/` for any
   Next.js API you touch; the §5 migration safety pipeline; the
   prohibition on `drizzle-kit push --force` for structural changes
   against live data).
2. `README.md` — engineering onboarding. The lazy DB client pattern,
   Auth.js lazy config, pooled vs unpooled DB URLs, the §5–§6 deploy
   pipeline, the `@layer base` gotcha (§7.11).
3. `PLAN.md` — authoritative overall plan. Read especially §1
   (product thesis), §3 (Phases 1–4 shipped), §5 (Phase 5 — your
   scope), §7 (open decisions), §8 (deployment & cost discipline).
4. `PHOTO_PLAN.md` — **your day-to-day reference.** §3 is your
   sequenced checklist. §5 holds the pre-answered decisions.

**Then read the owner's memory:**

5. `/Users/tomleger/.claude/projects/-Users-tomleger-repo-diy-reno/memory/MEMORY.md` (index)
6. `user_preferences.md`, `project_diy_reno.md`,
   `feedback_dates_anxiety.md` (the three files it points to).

**Then orient on what already exists in code:**

7. `src/db/schema.ts` — the `photos` table (~line 317) already has
   `project_id`, nullable `task_id`, `uploader_id`, `url`, `pathname`,
   `caption`. Indexes on project and task.
8. `src/app/api/upload/route.ts` — Blob client-upload token endpoint
   with auth + write-access enforcement.
9. `src/components/task/photo-uploader.tsx` — the current task-scoped
   uploader UI.
10. `src/app/actions.ts` — `registerPhoto` and `deletePhoto`
    (~line 381) with `revalidatePath` on project + task paths.

**Roughly 60% of `5.1 Foundation` already exists.** Your first job is
to finish it, not rebuild it.

---

## 1. The thesis you cannot lose sight of

DIY Reno is **not a to-do app.** It is an AI Foreman — a buddy / coach
character a solo DIYer interacts with. Every photo feature is judged
"does this make a better coach?" not "does this make a better
gallery?" Specifically:

- **The dream hero is the headline.** When 5.2 ships, the home page
  becomes the AI render of the user's kitchen-to-be, with the task
  list demoted to a sidecar. This is the reason the user opens the
  app.
- **Photos are how the Foreman sees the project.** Critique (5.6),
  smart crops (5.4), shooting suggestions (5.9), and same-angle
  pairing (5.7) give the Foreman more to react to.
- **Reality vs dream is a loop.** The dream is not a static poster;
  5.5 makes it the other end of a scrubbable journey.
- **Curation runs through the whole plan**, not as a single feature.
  Diptychs, hero shots, smart crops, and magazine spreads all feed
  §5.13's "Foreman's picks" — the curated home for the whole project.

If a design choice would make this feel like a CRM or PM tool, you
have made the wrong choice.

---

## 2. Non-negotiable constraints

These come from `PLAN.md` and the memory. **Do not relitigate them.**
If one is blocking, follow §6 (write `BLOCKED.md`) — do not work
around it.

- **§5 migration safety pipeline.** No `drizzle-kit push --force` for
  structural changes against live data. Schema changes go: edit
  `src/db/schema.ts` → `drizzle-kit generate` → hand-review the new
  `drizzle/*.sql` into **idempotent, non-destructive SQL** → the
  pipeline (`npm run db:deploy`) applies it. The seeded "Kitchen
  Renovation" is Tom's real data. Treat any risk to it as data loss.
- **Lazy DB client + Auth.js lazy config.** `next build` must not
  touch the DB. The DB client is a lazy `let`, not a Proxy. Auth.js
  uses the lazy config function form. Do not break this — it
  manifests as build failures.
- **DB env vars cannot be `vercel env pull`'d.** Migrations and seed
  run in the Vercel build (`npm run db:deploy`), not locally. Do not
  "fix" this by trying to pull env.
- **Pooled vs unpooled.** Runtime uses `DATABASE_URL`; drizzle-kit and
  seed use `DATABASE_URL_UNPOOLED`. Don't swap them.
- **Mobile-first is a HARD requirement.** A desktop layout squished
  down is a failure, not a baseline. Every shipped sub-phase must be
  verified at a phone viewport before you claim done. The home-screen
  change in 5.2 especially.
- **No-pressure UI on dates.** "3 weeks ago" only. No countdowns, no
  deadline overlays. Tom deleted the schedule model because dates
  gave him anxiety. (`feedback_dates_anxiety.md`.)
- **Cost-gated AI.** Caption / tag / embedding / ROI / safety calls
  run *once per upload* and cache on the row. The dream hero caches
  per project, regenerated only on listed `dreamTriggers` (see
  `PHOTO_PLAN.md` §5 Q3). §5.11 variants are per-request spend:
  **paint preview is unlocked** with a **5/day per-user cap (~$6/mo
  ceiling)** — see `BLOCKED.md` Resolution. **Material swap, empty
  room, side-by-side, and product insertion remain hard-stopped**;
  write `BLOCKED-2.md` and end the run before starting any of them.
- **`@layer base`** for global CSS overrides. Unlayered global rules
  lose to Tailwind utilities (README §7.11).
- **Voice consistency.** Photo critique (5.6), smart-crop captions
  (5.4), shooting nudges (5.9), and safety flags (5.3) all share the
  Foreman's warm / honest / willing-to-say-no character. Credibility
  comes from the no's. Don't invent a separate "photo assistant"
  voice.

---

## 3. Build order

Execute `PHOTO_PLAN.md` §3 in numerical order. Within each sub-phase,
work the `[ ]` checklist in order. **Tick each `[ ]` in
`PHOTO_PLAN.md` the moment it is done, not in batches** — a
compaction or crash mid-run will otherwise lose state.

### Order

5.1 through 5.10 v0 already shipped in the previous run (see
`PHOTO_PLAN.md` top handoff table for PR links + merge SHAs). Do
**not** rebuild them. The new run starts with the unblocked §5.11
v0 and then picks up deferred items that compound on its cost-cap
infra.

1. **5.11 v0 — paint preview.** Branch `phase-5-11-paint-preview-v0`.
   Ship as one PR.
   - `generation_log` table (project_id, user_id, kind, created_at,
     cost_estimate_cents) for server-side cap enforcement + audit.
     New migration — run through `npm run db:deploy` like every
     other schema change.
   - `renderPaintPreview(photoId, color)` server action via Gemini
     2.5 Flash Image through AI Gateway (same provider as the
     dream).
   - "Try this in your room" entrypoint in the photo lightbox —
     `Sparkles`-icon-gated, `canWrite` only, never default.
   - Today's spend + remaining cap surfaced in the dream-hero
     "Why this image?" panel.
   - **Cap = 5 renders / day per user, hard-enforced server-side**
     against `generation_log`. Cap exhaustion returns a friendly
     "you've used today's renders — back tomorrow" message, not a
     500.
2. **5.7 same-angle pairing.** Agent's call on embedding provider —
   `google/text-embedding-004` on the AI caption is an acceptable
   default; a dedicated image embedder via the Gateway is the
   alternative if you find it cheap enough. The embedding column
   already exists in `photo` (`drizzle/0006_photo_passive_vision.sql`)
   — wire the producer, then the matcher, then the diptych UI.
3. **5.13 remainder.** Magazine cover, photo essay, time-lapse,
   shareable postcards. Capstone-first ("Foreman's picks") already
   shipped; these are the editorial-spread expansions.
4. **5.14 floor-plan ingestion.** Property already has
   `floor_plan_url` + nullable `rooms` from Phase 1. Single Gemini
   Flash vision call + per-room confirmation UI.
5. **5.9 lightweight Foreman-as-photographer.** Shoot-suggestion
   tool over the existing hero-shot heuristic. **Skip the
   `getUserMedia()` framing overlay** — that's heavy client work,
   defer.
6. **5.12 annotation + measurement.** Only if there's still capacity
   in the run after 5.14 lands.
7. **HARD STOP — any §5.11 variant beyond paint preview.** Material
   swap, empty room, side-by-side, product insertion all stay
   parked. Write `BLOCKED-2.md` (see §6) before starting any of
   them and end the run. **5.15 closers** also stays parked — no
   urgency before "done enough."

### Per-sub-phase deliverables

For each sub-phase you ship:

- A PR named `Phase 5.N: <title>` against `main`, opened with
  `gh pr create`. Branch name: `phase-5-N-<slug>`.
- Migrations (if any) reviewed into idempotent SQL and applied via
  `npm run db:deploy` running in the Vercel build — not locally.
  After the deploy build runs, confirm green with `gh pr checks` and
  spot-check the deployed URL.
- Mobile-viewport verification — a Playwright MCP screenshot at
  iPhone 14 dimensions (390×844, DPR 3) of the screen you changed.
  If the screen is behind auth and you cannot log in, write the URL
  + the exact viewport command into the PR body under
  `## Tom-must-verify` and proceed.
- An update to `PHOTO_PLAN.md`: ticked `[ ]` boxes (live, not
  batched) and a `✓ 5.N shipped <commit-sha>` line at the top of
  that sub-phase.
- A PR description with three sections: **Shipped** (what merged),
  **Verified** (what you screenshotted / clicked through),
  **Tom-must-verify** (what only his authenticated browser can
  confirm).

### Tooling for execution

You have a Claude Code toolbelt. Use the right tool, not the
generic one:

- **Codebase research wider than ~3 greps** → spawn the `Explore`
  subagent. Don't waste main-context tokens on it.
- **Schema / SQL review** → invoke the `engineering:code-review`
  skill on the generated `drizzle/*.sql` before any `db:deploy`.
  This is the cheapest insurance against data loss.
- **Browser verification (mobile + desktop)** → Playwright MCP
  (`mcp__plugin_playwright_playwright__*`). Default viewport
  390×844 for mobile, 1280×800 for desktop. Take screenshots and
  attach to the PR body.
- **Local app sanity** → `run` skill, not raw `npm run dev`. It
  knows the project's launch pattern.
- **Deploy + status** → `vercel-plugin:deploy` skill and
  `vercel-plugin:status` skill, plus `gh pr checks`. Don't claim
  "deploy green" without one of these confirming.
- **Vercel runtime logs / build logs** (when a deploy fails) →
  `mcp__4c5fe5e8…__get_deployment_build_logs` and
  `…__get_runtime_logs`, not blind retries.
- **AI Gateway** for 5.2 / 5.3 / 5.4 / 5.6 model calls — never
  direct provider SDKs. Provider switching is then a config change,
  not a code change.
- **TaskCreate** for any sub-phase with >3 steps. Update status
  immediately, not in batches.

---

## 4. Pre-resolved decisions

`PHOTO_PLAN.md` §5 contains owner-locked answers to all seven open
questions from rev. 2 — provider choices, `styleProfile` shape,
`dreamTriggers` list, vision provider, same-angle threshold, receipt
confidence floor, Sunday postcard cadence. **Read them. Build to
them. Do not re-raise them** unless implementation reveals a specific
blocker (e.g. provider API change, schema collision with existing
columns).

One follow-on check is baked into 5.2:

- **5.2 quality reassessment after 20 dream renders.** Audit "same
  kitchen evolving" against the §5.2 exit criterion. If failing,
  raise via `BLOCKED.md` (§6) — FLUX Kontext is the named fallback.

5.11's cost gate is covered in §2 and §3 (hard stop, write
`BLOCKED.md`).

---

## 5. How to work day to day

- **TaskCreate** for any sub-phase with more than ~3 steps. Update
  status as you go, not at the end.
- **One PR per sub-phase** by default — except 5.2 + 5.3, which may
  stack (§3 item 2).
- **Read `node_modules/next/dist/docs/`** for any Next.js API you
  touch. The training data is wrong for Next.js 16. `AGENTS.md` is
  explicit on this.
- **Server actions, not API routes,** for any mutation invoked from
  a React component. API routes only where the existing pattern uses
  them (e.g. `/api/upload` for the Blob token).
- **`revalidatePath` after every mutation** that affects a page's
  read path. The existing actions in `actions.ts` are the pattern;
  follow them.
- **Don't add abstractions you don't need.** Single-user app today.
  Don't build a multi-tenant photo service. Don't pre-optimize for
  scale that isn't here.
- **Don't add tests speculatively.** No test harness exists. If your
  code is risky enough that it needs one, raise that as a separate
  proposal to Tom — don't sneak it in.
- **Honest claims only.** "Code-complete, build-clean, deployed;
  Tom needs to verify on his phone" is the right done-statement.
  "Phase 5.N shipped ✓" without a browser-test note is **not**.
  Phases 2–4 already have this verification gap on the books — don't
  add to it without acknowledging it.

---

## 6. How to stop or escalate

**Tom is asleep.** You cannot ask him in chat. The escalation
mechanism is a file: write `BLOCKED.md` at the repo root, commit it
to your current branch, push, and end the run. Tom reads it in the
morning.

**Stop and write `BLOCKED-2.md` before:**

- Starting **any §5.11 variant beyond paint preview** (material
  swap, empty room, side-by-side, product insertion) — paint
  preview is unlocked; the rest are still hard-stopped
- The 5.2 quality reassessment after another 20 renders, if quality
  is failing (FLUX Kontext switch is named fallback — recommend it)
- Any migration whose hand-reviewed SQL is non-trivial or would risk
  the seeded "Kitchen Renovation" data
- Anything that would change `PLAN.md` or `PHOTO_PLAN.md` direction
- Pulling anything from `PHOTO_PLAN.md` §6 ("What is NOT in this
  plan") forward
- Starting 5.15 closers (parked — no urgency before "done enough")
- A third consecutive failure on the same step you can't diagnose

**Do not stop for:**

- Anything already resolved in `PHOTO_PLAN.md` §5
- Implementation details inside an `[ ]` item
- Refactoring decisions inside a single component
- Library choices with no ongoing cost
- Visual tweaks that follow the `PLAN.md` §3.4 language

### `BLOCKED.md` format

```
# Blocked: <sub-phase, one-line question>

**Where I am:** <branch, last passing step, what's done in PHOTO_PLAN.md>
**The decision:** <the specific file/line/choice that needs a call>
**Options:**
  1. <option, with cost / risk>
  2. <option, with cost / risk>
**My recommendation:** <one of the above, one sentence why>
**If you say yes, I'll:** <concrete next action>
```

Be specific. Don't open-ended brainstorm at him; he's
mid-renovation.

---

## 7. Success criteria

You have executed `PHOTO_PLAN.md` **perfectly** when:

- All `[ ]` boxes in §3 (5.1 through 5.15, excluding 5.11 variants
  beyond paint preview) are checked. Paint preview's boxes get
  ticked when shipped; material swap / empty room / side-by-side /
  product insertion stay unticked pending a second Tom decision.
- Each sub-phase shipped as its own PR, with mobile-viewport
  verification.
- The home screen, post-login, leads with the dream hero.
- Tom logs in and sees the kitchen-to-be.
- The §5 deploy pipeline ran green for every schema change.
- The seeded "Kitchen Renovation" survived every migration intact.
- The Foreman's voice is consistent across critique (5.6),
  smart-crop captions (5.4), photographer (5.9), and safety (5.3).
- Sunday postcard (5.2) is opt-in, off by default.
- No countdowns, no deadline overlays on any photo screen.
- Cost discipline held: caption / tag / embedding / ROI / critique
  ran once per upload; dream hero cached per project; 5.11 paint
  preview is the only per-request spend, capped at 5/day per user
  via `generation_log`. Other 5.11 variants remain deferred.
- §5.13's "Foreman's picks" exists and pulls from diptychs (5.7),
  hero shots (5.9), smart crops (5.4), and magazine spreads.

### End-of-run handoff (you will not finish in one night)

You almost certainly will not get from 5.1 through 5.15 in one
overnight run. When the run ends — whether you finish, hit a
blocker, or run out of context — leave Tom one breadcrumb:

- At the top of `PHOTO_PLAN.md`, under the existing header, write a
  `## Overnight run <ISO date>` block: which sub-phases shipped (link
  to PRs), what's in flight on which branch, what's blocked
  (link to `BLOCKED.md` if any), and the *exact* next action when
  he resumes.
- Commit that update on `main` so he sees it without checking
  branches.

If everything in §3 (minus 5.11) actually shipped, the breadcrumb
becomes a final message in the conversation:

> Phase 5 (minus 5.11) is done. PRs: … Here's what to verify on your
> phone: …

…then stop.

---

## 8. First action

After reading §0 documents, do **this**, in this order — no
ceremony, no announcement message:

1. `git checkout -b phase-5-11-paint-preview-v0` from latest `main`.
2. `TaskCreate` the §3 item 1 checklist (generation_log table +
   migration; `renderPaintPreview` server action; "Try this in
   your room" lightbox entrypoint; dream-hero spend surface;
   server-side cap enforcement against `generation_log`), one
   task per bullet.
3. Spawn an `Explore` subagent to map the existing render path
   for the dream (so paint preview reuses the AI Gateway client
   pattern, the Blob caching pattern, and the lightbox component
   shape rather than inventing new ones). Brief it with the dream
   render code from PR #2 (commit `23ba40f`) and the dream
   grounding fix from PR #10 as starting points.
4. Start the first `[ ]`. When paint preview lands, move to §3
   item 2 (5.7 same-angle pairing) without further ceremony.

Your first user-visible text should be a single line:
`Starting 5.11 v0 paint preview on phase-5-11-paint-preview-v0.
Cap: 5/day. Then 5.7 → 5.13 remainder → 5.14 → 5.9 light.` Then
work. No further owner input is needed before any other §5.11
variant.
