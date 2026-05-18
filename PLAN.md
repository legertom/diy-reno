# DIY Reno — Implementation Plan

> Status: **Phases 1 & 2 shipped to production (2026-05-18).** §5 signed off
> 2026-05-18 (as written). Phase 1 (deploy `1c18917`) and Phase 2 (deploy
> `d20f76a`) both ran the full §5 pipeline against prod: snapshot taken +
> recorded, idempotency gate PASSED on a real Neon branch copy, reviewed
> migrations (`0001`+`0002`) applied, live "Kitchen Renovation"
> intact/owned/nested, post-migration verification passed, app live —
> verified from build logs, not intent. Phase 2 behavioral features
> (memory recall, compaction, start-fresh) are deployed + type/build-clean
> but not yet browser-tested in an authed session. **Next: Phase 3 (visual
> language — "evolve the blueprint").** Date: 2026-05-17. Branch:
> `claude/cool-morse-fc6a66`. Read `AGENTS.md` and `README.md` first; this
> plan assumes both.

---

## 0. How to use this document

This is the **build order and the why behind it**. The `README.md` documents the
app as it exists today; this plan documents where it is going and in what
sequence. Each phase has concrete deliverables, the files/areas it touches, its
dependencies, and explicit exit criteria so it can be picked up cold by another
engineer or agent. Decisions still needing the owner (Tom) are collected in §7.

---

## 1. Product thesis — the lens for every decision

DIY Reno is **not a project to-do list**. It is an AI **"Foreman"**: a buddy and
coach — an experienced general contractor who guides a *solo* DIYer through a
renovation by text and AI imagery. Tom frames it as *"almost a reality-TV
website"*: the Foreman is a **character the user wants to interact with**, not a
utility. The phase/task structure is scaffolding for that relationship.

Every decision below is judged "does this make a better **coach/character**,"
not "a better CRUD app." Concrete implications, applied throughout:

- **Proactive**, not only reactive — anticipates the next hard step.
- **Person-aware** — models the user's skill/confidence/first-timer status.
- **Warm but honest** — willing to say *"stop, call a licensed pro."* Bad
  construction advice has physical-safety stakes; credibility comes from the no's.
- **Anxiety-aware** — no pressure UI. Dates are opt-in; intake never gates;
  surface a personal "done enough" bar, not countdowns. (Tom deleted the old
  schedule model because deadlines gave him anxiety.)
- **Mobile-first is a hard requirement** — used on a phone, on-site. A
  desktop column squished down is a failure, not a baseline.
- **Cost-conscious** — free-tier / Vercel-native bias. Expensive AI (image
  rendering) must be gated.

---

## 2. Current state (baseline)

**Stack:** Next.js 16 (App Router/RSC) · React 19 · Tailwind v4 (`@theme` in
`globals.css`) · Auth.js v5 (Google, DB sessions) · Neon Postgres + Drizzle ·
Vercel Blob · AI SDK v6 via Vercel AI Gateway · Vercel git deploy (push `main`
→ prod).

**Hard constraints (from README §7–§8) the plan must respect:**

- DB client is a lazy `let` (never a Proxy); Auth.js uses the lazy config
  function form — both keep `next build` from touching the DB. Do not break this.
- Sensitive Neon env vars **cannot** be `vercel env pull`'d → migrations/seed
  run *in the Vercel build* (`npm run db:deploy`). Do not "fix" by pulling env.
- Runtime uses pooled `DATABASE_URL`; drizzle-kit/seed use
  `DATABASE_URL_UNPOOLED`.
- Deploy runs `vercel.json` → `npm run db:deploy && npm run build`, where
  `db:deploy` = `drizzle-kit push --force` then seed. **`push --force`
  auto-applies drops.** This is the central migration hazard (see §5).
- `cn()` in `src/lib/utils.ts` is an extended tailwind-merge: **any new color
  token added to `@theme` must also be registered in its color list**, or
  `text-<token>` gets stripped.
- The Foreman's `commit()` is the honesty boundary — never report `ok:true`
  for a write that didn't run. All new write tools stay inside it.

**Gaps relative to the thesis:**

| Area | Today | Problem |
|---|---|---|
| Data model | `project` conflates the *place* and the *work* | No reuse of place facts across renos; no rooms/measurements/floorplans |
| Foreman memory | `chat_message` thread is wiped + fully reinserted every turn; whole transcript replayed | Unbounded cost/turn; no durable "remember this"; no user reset |
| UI | Centered single column of equal-weight cards + literal blueprint cosplay | Reads as a blog, not a chic editorial product; not truly mobile-first |
| Foreman presence | A `size-9` hammer icon in the corner | The product thesis is buried |
| Onboarding | New user → empty dashboard + form | No guided, conversational intake |
| Live data | Seeded "Kitchen Renovation" is Tom's **real** plan | Any schema change is a live-data migration, not greenfield |
| Tests | None | LLM-mutating tools have no regression safety net |

---

## 3. Target architecture

### 3.1 Entity model

```
User (customer)        identity + cross-property relationship/coaching memory
  └─ Property           the place: Brooklyn co-op apt · Vermont house
        type · location · ownership · rooms/spaces · floor plans · measurements
        └─ Project       a unit of work: the kitchen reno
              brief · phases · tasks · progress/before/after photos
              └─ Phase
                   └─ Task
```

- **User** — identity; spans properties. Home of user-level Foreman memory.
- **Property** — the physical place. Structured fields: type
  (apartment/house/other), ownership (condo/co-op/owned/rented), location;
  plus the **rooms/spaces** primitive (floor-plan + measurement fields
  nullable initially). Entered once via intake, **reused by every project on
  it**. This is where the "intake: structured fields vs freeform brief" fork
  resolved — constrained intake answers are Property fields.
- **Project** — a unit of work on a Property. Brief, phases, tasks, and
  **progress/before/after photos** (photos document the work → project-scoped;
  baseline room state/dimensions → property-scoped).
- **Sharing** stays at **Project** level (a contractor sees the kitchen reno,
  not the whole Vermont house). Property is purely the organizing parent.
  Pending explicit confirmation — see §7.

### 3.2 Foreman memory & conversation lifecycle

Three tiers; only the transcript is a problem today:

1. **Project/Property/User state** — already durable in the DB; rebuilt into
   the system prompt fresh every turn. Nothing to fix.
2. **The transcript** — must **compact**: at a token/turn threshold, roll
   older turns into a running summary, keep the last N verbatim. Replaces the
   current unbounded wipe-and-reinsert. *Net cheaper* (one summarize call vs.
   replaying the whole history every turn).
3. **Durable Foreman memory (new)** — a small structured store, scoped
   **user / property / project**, written by the Foreman via a
   `remember`/`forget` tool (inside `commit()`), injected into the prompt
   every turn like project state. User can also pin/forget.

**Reset = "new episode":** clears the transcript + rolling summary for that
scope; the memory store and project/property/user data **survive**. The
character is never amnesiac after a reset — that continuity is what makes it a
character, not a chatbot. "Start fresh" is the prominent action; "make it
forget X" is a rare, separate one.

### 3.3 Conversational intake — the Foreman as "first scrivener"

Project/property creation is a **Foreman-led conversational interview**, not a
form. The form editors become the edit/override layer. This is also the
**new-user onboarding**.

- **Conversational, never a wizard.** Quick-reply **buttons** (apt / house /
  other …) render *under a human turn*, as accelerators — the user can always
  type instead. **"Other" is always a free-text escape; buttons never gate.**
- **Objective, not a script.** The Foreman gets a live "still-needed"
  checklist injected into its prompt and pursues it opportunistically: adapts
  order to what the user volunteers, infers/skips what's irrelevant (a renter
  isn't asked about moving structural walls), never counts questions, stops
  when it has enough.
- **Never gate on completeness** — collect enough to start, backfill as the
  work surfaces it.
- **Two-stage:** one-time "tell me about the place" (Property) → per-project
  "what are we doing" (Project). You never re-answer "is it a co-op."
- **Mechanism:** a new reusable `ask`/`choice` tool whose tool-call renders as
  tappable chips — a clean extension of the route's existing `TOOL_LABELS`
  tool-result chip rendering in `task-chat.tsx`.

### 3.4 Design language — "evolve the blueprint"

Chosen direction: **evolve** (not full reset, not type-only). Keep one quiet
structural signature; cut the skeuomorphic excess; modernize type/scale; go
photo-led and genuinely mobile-first.

**The one surviving signature:** the **dimension line** (`.dim-rule` —
hairline with end-ticks) as the recurring divider, plus a **rigorous numeral
system** (two-digit section numerals, `#num` tasks). The architectural soul,
distilled — reads expensive, not costume.

| Keep / evolve | Kill |
|---|---|
| `.dim-rule` as the divider motif | Fixed body drafting grid |
| Two-digit numerals, `#num` | `.sheet-frame` inset borders |
| `eyebrow` recast as editorial kicker | `.tick-corners` / `.ticked` corner marks |
| Deep navy as *rare punctuation* | `◳` glyph wordmark, "Sheet A-2", "Dossier", "Drawing set · Lead builder" |
| | Pastel `*-tint` filled cards as default surface |

- **Type:** drop Archivo (a grotesque). One **geometric** family used across a
  dramatic scale range (~64–96px display down to 11px tracked labels). Drop
  the fake `--font-mono`/`--font-display` aliasing to one face. Recommended:
  **Geist** (Vercel-native, free, fits cost bias) or **Sora**; real Gotham is
  paid. Final pick in §7.
- **Layout:** photography-led, asymmetric, generous negative space. The room
  is the hero, not chrome. Edge-to-edge on mobile, not a centered `max-w-3xl`
  letterbox.
- **Coach surface:** promote the Foreman from a corner icon to a **persistent,
  prominent surface** — bottom-anchored on mobile. Non-negotiable; it's the
  thesis.
- **Token discipline:** every palette change in `@theme` must also update the
  `cn()` color list in `src/lib/utils.ts` (README §7.1).

---

## 4. Phased build plan

Risk-first and dependency-ordered. Each phase is a coherent shippable unit.

### Phase 1 — Data-model spine + safe migration  ⟶ *gated on §5 sign-off*

**Goal:** introduce `User → Property → Project` without endangering live data.

Deliverables (code complete + locally verified: `tsc`, `eslint`,
`next build` all green; `next build` still opens no DB connection):
- [x] `property` table (type, ownership, location; nullable floor-plan /
      measurement fields) + rooms/spaces stub on Property.
- [x] `project.propertyId` FK (nullable, `on delete set null` → migration is
      non-destructive).
- [x] **Generated, reviewed migration** (not blind `push --force`) with an
      idempotent, non-destructive backfill: one Property per owner with
      unparented projects, then nest them. Artifact: `drizzle/0001_add_property.sql`
      (reviewed). *Non-destructive/idempotent against live data is proven by
      the §5 branch gate on first deploy — see §5 checklist.*
- [x] Seed updated: fresh installs nest "Kitchen Renovation" under a
      "Brooklyn apartment" Property; remains idempotent + non-destructive.
- [x] `src/lib/projects.ts` threaded for Property; sharing stays
      project-level (`assertOwnsProperty` = owner-only Property writes);
      `listProjectsForUser` carries each project's `property` (grouping data
      threaded; visual grouping is Phase 3, no redesign now).
- [x] `src/app/actions.ts` — `createProperty` / `updateProperty`
      (owner-gated, the Property analogue of `assertCanWrite`); `createProject`
      now nests new projects under a Property.
- [x] Existing screens keep working against the new model unchanged (additive
      schema; verified via `next build`; **no redesign**).
- [x] README + AGENTS updated; migration pipeline change documented.

Files/areas: `src/db/schema.ts`, `src/db/index.ts` (unchanged pattern),
`src/lib/projects.ts`, `src/app/actions.ts`, `drizzle` config, seed script,
`vercel.json` / `db:deploy` (see §5), `src/app/page.tsx` & `p/[projectId]`
(minimal wiring).
Dependencies: none (foundational). Exit: live seed intact post-migration;
existing flows green; new Property readable/writable; deploy pipeline uses the
reviewed migration path.
Risk: **high** (live data) — fully mitigated by §5.

### Phase 2 — Foreman memory + compaction + reset

**Goal:** persistent character across a resettable, bounded conversation.

Deliverables (code complete; `tsc`/`eslint`/`next build` green; migration
0002 applied to prod via the §5 pipeline — see status below):
- [x] Memory store table scoped user/property/project — `foreman_memory`
      (`scope` + `scope_id`, per-user). Plus `chat_thread` for the rolling
      summary. Migration `drizzle/0002_foreman_memory.sql` (additive, no
      backfill, no DROP).
- [x] `remember` / `forget` Foreman tools, inside `commit()`; surfaced as
      `TOOL_LABELS` chips ("Saved to memory" / "Updated memory").
- [x] System-prompt assembly injects scoped memory + the rolling summary
      alongside project state.
- [x] Transcript **compaction**: > `KEEP_LAST`(12)+`COMPACT_BATCH`(8) turns
      → one cheap `generateText` folds the batch rolling out of the window
      into `chat_thread.summary`; model sees only the last 12 + summary +
      memory. Replaces the unbounded wipe/reinsert in `onFinish`.
- [x] **"Start fresh"** reset (`resetForemanThread`, write-gated, keyed like
      the existing `taskId` / `taskId IS NULL` threads): clears transcript +
      summary, **preserves `foreman_memory`**. UI button in `task-chat.tsx`.

Files/areas: `src/db/schema.ts`, `drizzle/0002*`, `scripts/db-deploy.ts`
(pipeline generalized to apply all `000N>=1` migrations), `src/app/api/chat/
route.ts`, `src/app/actions.ts`, `src/components/task/task-chat.tsx`.
Dependencies: Phase 1 (met). Exit: long threads stay bounded and cheaper
(model input capped at last 12 + summary); facts persist across resets;
reset never wipes memory. **Migration verified in prod logs (deploy
`d20f76a`): pipeline applied `0001`+`0002`, snapshot taken, gate PASSED,
live data intact. Behavioral features (memory recall, compaction firing,
start-fresh) are deployed and type/build-clean but not yet exercised in an
authenticated browser session — interactive confirmation recommended.**

### Phase 3 — Visual language ("evolve the blueprint")

Deliverables:
- [ ] Swap font (Geist/Sora) in `layout.tsx`; remove mono/display aliasing.
- [ ] `globals.css` `@theme`: new scale + palette; remove cosplay utilities;
      keep `.dim-rule` + numerals. Update `cn()` color list in lockstep.
- [ ] Rework `src/components/ui.tsx` primitives + `app-header.tsx` (kill
      `◳`/sheet codes), `task-row.tsx`, `page.tsx`, `p/[projectId]/page.tsx`
      to photo-led, mobile-first, asymmetric.
- [ ] Foreman promoted to a persistent bottom-anchored surface on mobile
      (`foreman-bubble.tsx` / `foreman-launcher.tsx`).

Dependencies: ideally after Phase 1 (Property/photo data exists to art-direct
around). Exit: passes a real mobile-device check; no longer reads as a blog;
coach is front-and-center.

### Phase 4 — Conversational intake / onboarding (first scrivener)

Deliverables:
- [ ] `ask`/`choice` tool + chip rendering with always-available free-text.
- [ ] "Still-needed" objective injected into the system prompt; opportunistic,
      non-gating intake behavior.
- [ ] Two-stage Property → Project intake; replaces the empty-dashboard
      onboarding for new users.

Files/areas: `src/app/api/chat/route.ts`, `src/components/task/task-chat.tsx`,
new-user entry in `src/app/page.tsx`.
Dependencies: Phases 1 & 2. Exit: a brand-new user can create a Property +
Project entirely by conversation; feels like talking, captures structure.

### Phase 5 — Photo timeline → AI renderings → floor-plan ingestion

Deliverables (in this order — cheapest/highest-pain-relief first):
- [ ] Progress/before/after **photo timeline** (project-scoped; private to
      project members; reuses Blob client-upload).
- [ ] **Photo critique** ("look at my work — is this right?") — high value for
      the solo pain; reuses the cheap vision-to-text pattern.
- [ ] **AI renderings** (image generation) — **cost-gated / rate-limited**.
- [ ] **Floor-plan ingestion** (vision → structured rooms/measurements on
      Property; extends the `identify-tools` pattern).
- [ ] Blob lifecycle: delete blobs on row delete (orphan cleanup).

Dependencies: Phases 1–3. Exit: each sub-feature usable on mobile; renderings
spend is bounded.

### Deferred (not in this plan unless asked)

- **AI plan generation** — describe a project → Foreman scaffolds the full
  phased plan. The heavy, long, resumable piece; Vercel Workflow
  `DurableAgent` fit. The Phase 4 *interview* is its lightweight front half and
  ships independently.
- Voice = device dictation only (no in-app STT).

---

## 5. Migration safety plan (Phase 1 — the riskiest thing)

**The risk:** the seeded "Kitchen Renovation" is Tom's *real* renovation plan.
The deploy pipeline runs `drizzle-kit push --force`, which **auto-applies
drops**. Introducing `property` as a new parent of `project` is exactly the
structural change README §8 warned about; a careless push could orphan or drop
live rows.

**Strategy — do not use blind `push --force` for this change:**

1. **Snapshot first.** Take a Neon branch/point-in-time snapshot of the
   production database before any structural change is applied.
2. **Generated, reviewed migration.** Use `drizzle-kit generate` to produce an
   explicit SQL migration for the `property` introduction + FK + backfill, and
   review it. This is the README §8 "move to generated migrations before
   there's real data" moment arriving — adopt it now, for this change.
3. **Idempotent, non-destructive backfill.** Backfill creates one Property per
   existing owner and sets `project.propertyId`; safe to re-run; never drops.
   Mirrors the existing seed's idempotent/non-destructive philosophy.
4. **Pipeline change.** Update `vercel.json` / `db:deploy` so the deploy
   applies the *reviewed migration* path (not `push --force`) for this and
   subsequent structural changes; keep seed idempotent.
5. **Verify + rollback.** Post-migrate assertion that the live project still
   exists, is owned correctly, and is nested under its Property. Documented
   rollback = restore the Neon snapshot.

Checklist (all required before Phase 1 is "done") — **all verified from the
production build logs of deploy `1c18917` (2026-05-18)**:
- [x] Neon snapshot taken & location recorded — branch
      `presnapshot-2026-05-18T04-54-51-103Z-1c18917`
      (id `br-polished-dew-apctx5ob`); rollback = restore it in Neon.
- [x] Generated migration reviewed — `drizzle/0001_add_property.sql`,
      purely additive, no `DROP`, nullable FK, `on delete set null`.
- [x] Backfill proven idempotent on a Neon branch copy — pipeline cloned a
      `migrationtest-…` branch from the 1 live project, applied the
      migration twice, asserted non-destructive + idempotent: `Gate PASSED`.
- [x] Deploy pipeline switched off blind `push --force` for structural
      changes — `db:deploy` → `scripts/db-deploy.ts`.
- [x] Post-migration verification of the live seed passes — `[§5.5]
      Production verified — live data intact, owned correctly, nested under
      Property.` Seed correctly skipped the existing live project.

> The first failed deploy (`cd94ba9`) proved the fail-safe: a bug in the
> pipeline's baseline probe aborted the run *after* the snapshot and *before*
> any production write — nothing shipped, no data touched. Fixed in
> `1c18917`, which then passed the gate and applied cleanly.

---

## 6. Cross-cutting concerns

- **Cost.** AI Gateway billed. Compaction (Phase 2) *reduces* net token
  cost. Renderings (Phase 5) are the expensive outlier → gate/rate-limit.
  Default to free-tier / Vercel-native.
- **Mobile-first.** Every phase verified at a phone viewport; on-device check
  before "done." Edge-to-edge, thumb-zone actions, large targets.
- **Anxiety-aware.** No pressure UI anywhere. Dates (if ever added) opt-in,
  framed around a personal "done enough" bar, never countdowns/overdue.
  Intake never interrogates.
- **Foreman advice honesty.** Coaching tone is warm but must tell the user to
  stop and call a licensed pro where stakes are physical. `commit()` honesty
  boundary preserved for every new write tool.
- **Privacy.** Photos are private — shared only with project members. Blob
  orphan cleanup is a Phase 5 deliverable.
- **Testing.** There is currently **no test suite**. The Foreman's
  data-mutating tools and the Phase 1 migration are the highest-risk,
  least-covered code. Recommend a minimal harness (migration/backfill
  idempotency, memory store, Foreman tool happy-paths) — see §7.
- **Framework.** Per `AGENTS.md`, read `node_modules/next/dist/docs/` before
  writing Next.js code; this Next.js diverges from training data.

---

## 7. Open decisions / needs owner input

| # | Decision | Recommendation | Status |
|---|---|---|---|
| 1 | Migration-safety approach for live data (§5) | Adopt §5 as written | **Signed off 2026-05-18 (as written)** |
| 2 | Collaborator sharing scope | Project-level (least-privilege) | Confirm |
| 3 | Exact structured Property field set | Minimal: type, ownership, location; rest → brief/memory | Confirm during Phase 1 |
| 4 | Final typeface | Geist (free, Vercel-native) | Confirm in Phase 3 |
| 5 | Minimal test harness now vs later | Add alongside Phase 1 (migration is risky) | Decide |
| 6 | Blob orphan cleanup, AI rate-limiting, local-dev-without-secrets (raised in the original README review) | Address in Phase 5 / as policy | Track |

---

## 8. Sequencing rationale

Foundation before features: the Property/User model (Phase 1) and the
memory/transcript subsystem (Phase 2) are what *almost everything* hangs off —
intake, photos, measurements, the character's continuity. The visual language
(Phase 3) is cheap and unblocked but lands best once there's photo/Property
data to art-direct around. Intake (Phase 4) needs both the model and the
memory. The expensive/AI-heavy work (Phase 5) is last and cost-gated. Heavy
plan-generation stays deferred so it can't drag risk into the foundation.
