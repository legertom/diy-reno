# Photo Phase Execution Prompt

> **Read this once, then operate from it.** You are a fresh Opus 4.7
> agent starting at the project root of DIY Reno with no memory of
> prior conversations. Your job is to execute `PHOTO_PLAN.md` end to
> end, in the sequence and to the standards defined below. **All
> seven open questions are pre-resolved in `PHOTO_PLAN.md` §5; no
> blocking-decision rounds are required.** This document is your
> operating contract. The owner is Tom (tomleger@gmail.com).
>
> Rev. 2 — 2026-05-24.

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
If one is blocking, ask Tom — do not work around it.

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
  `PHOTO_PLAN.md` §5 Q3). Only §5.11 variations are per-request
  spend. Add a per-user daily cap to every 5.11 entrypoint from
  day one.
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
work the `[ ]` checklist in order. Each sub-phase ends at its `Exit:`
criterion.

### Order

1. **5.1 Foundation** — *partially done.* Finish: project-level
   timeline view, EXIF extraction, room-attach, camera button on
   project home, reorder, cascade Blob delete on row delete.
   **Verify the cascade actually runs by deleting a test task /
   project.**
2. **5.2 Dream hero** — provider, styleProfile shape, and
   dreamTriggers list are all in `PHOTO_PLAN.md` §5. Just build.
3. **5.3 Passive AI** — *ships in parallel with 5.2.* Provider
   locked (Gemini Flash via AI Gateway, §5 Q4). Substrate for 5.6+.
4. **5.4 Smart crops & details** — *new sub-phase.* Same vision
   call as 5.3 returns 3–5 ROIs per photo. Surfaced as a
   "Foreman noticed these…" strip. JSON column on `photo`. Compounds
   into 5.5, 5.7, 5.8, 5.12, 5.13.
5. **5.5 Reality-vs-dream loop** — depends on 5.2 landing.
   ROI-aware punch list uses 5.4.
6. **5.6 through 5.15** — in numerical order. **Stop and check
   with Tom before starting 5.11** (per-request generative work —
   a real material cost commitment).

### Per-sub-phase deliverables

For each sub-phase you ship:

- A PR named `Phase 5.N: <title>` against `main`
- Migrations (if any) reviewed into idempotent SQL, run through
  `npm run db:deploy`
- Mobile-viewport verification — a phone-sized browser screenshot, or
  an honest "Tom needs to verify on his phone"
- An update to `PHOTO_PLAN.md` — tick the relevant `[ ]` boxes; add a
  `✓ 5.N shipped <commit>` line at the top of that sub-phase
- A short PR description: what shipped, what was tested, what
  *wasn't* tested and needs Tom's authenticated browser

---

## 4. Pre-resolved decisions

`PHOTO_PLAN.md` §5 contains owner-locked answers to all seven open
questions from rev. 2 — provider choices, `styleProfile` shape,
`dreamTriggers` list, vision provider, same-angle threshold, receipt
confidence floor, Sunday postcard cadence. **Read them. Build to
them. Do not re-raise them** unless implementation reveals a specific
blocker (e.g. provider API change, schema collision with existing
columns).

Two follow-on checks are baked into 5.2 and 5.11:

- **5.2 quality reassessment after 20 dream renders.** Audit "same
  kitchen evolving" against the §5.2 exit criterion. If failing,
  raise to Tom — FLUX Kontext is the named fallback.
- **5.11 material-cost gate.** Per-request generative spend is a
  budget commitment. Stop and confirm with Tom before shipping
  *any* 5.11 deliverable.

---

## 5. How to work day to day

- **TodoWrite / TaskCreate** for any sub-phase with more than ~3
  steps. Surface progress as you go.
- **One PR per sub-phase.** Do not bundle 5.1 with 5.2.
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

**Ask Tom before:**

- The 5.2 quality reassessment after 20 renders, if quality is
  failing (provider switch decision)
- Any 5.11 deliverable (material cost commitment)
- Any migration whose hand-reviewed SQL is non-trivial or would risk
  the seeded "Kitchen Renovation" data
- Anything that would change `PLAN.md` or `PHOTO_PLAN.md` direction
- Pulling anything from `PHOTO_PLAN.md` §6 ("What is NOT in this
  plan") forward

**Do not ask Tom about:**

- Anything already resolved in `PHOTO_PLAN.md` §5
- Implementation details inside an `[ ]` item
- Refactoring decisions inside a single component
- Library choices with no ongoing cost
- Visual tweaks that follow the `PLAN.md` §3.4 language

When you ask, be specific: name the file / line / decision, propose
1–2 concrete options, recommend one. Don't open-ended brainstorm at
him; he's mid-renovation.

---

## 7. Success criteria

You have executed `PHOTO_PLAN.md` **perfectly** when:

- All `[ ]` boxes in §3 (5.1 through 5.15) are checked.
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
  ran once per upload; dream hero cached per project; only §5.11
  spent per-request, with a daily cap in place.
- §5.13's "Foreman's picks" exists and pulls from diptychs (5.7),
  hero shots (5.9), smart crops (5.4), and magazine spreads.

When all of §3 ships and the success criteria hold, send Tom a single
message:

> Phase 5 is done. Here's what to verify on your phone: …

…with the list. Then stop.

---

## 8. First action

After reading the documents in §0, your first message back to Tom
should be:

> I've read AGENTS.md, README.md, PLAN.md, PHOTO_PLAN.md, and the
> memory. The photo infrastructure already covers roughly 60% of
> 5.1. Here's the remaining 5.1 scope I'll ship in the first PR
> (project-level timeline, EXIF extraction, room-attach, camera
> button on project home, cascade-delete verification): …
> Then I'll start 5.2 and 5.3 in parallel using the locked
> decisions in PHOTO_PLAN.md §5.

Then start on 5.1. No blocking questions. No further owner input
needed before 5.11.
