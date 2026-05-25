# Photo Plan — expanding §5 of `PLAN.md`

> Status: **Draft, 2026-05-24 (rev. 3).** Expands `PLAN.md` §5 (Phase 5 —
> "Photo timeline → AI renderings → floor-plan ingestion") into a
> buildable order, refolded around the AI dream render as the
> motivational center. **All seven open questions resolved (§5);** the
> overnight agent can execute end-to-end without further input. Read
> `AGENTS.md`, `README.md`, and `PLAN.md` first; this plan assumes all
> three.

## Overnight run 2026-05-24 — end-of-run handoff

**Six sub-phases shipped to prod.** Six PRs merged via the §5 pipeline,
all green, live "Kitchen Renovation" intact through every migration.

| # | Title | PR | Merge commit |
|---|---|---|---|
| 5.1 | Foundation — timeline, EXIF, attach, camera | [PR #1](https://github.com/legertom/diy-reno/pull/1) | `c2eda67` |
| 5.2 | Dream hero — kitchen-to-be as headline | [PR #2](https://github.com/legertom/diy-reno/pull/2) | `23ba40f` |
| 5.3 + 5.4 substrate | Passive vision (caption/tags/ROIs/safety) | [PR #2](https://github.com/legertom/diy-reno/pull/2) | `23ba40f` |
| 5.5 | Reality-vs-dream — today↔dream toggle | [PR #3](https://github.com/legertom/diy-reno/pull/3) | `a259195` |
| 5.6 | Photo critique — "Ask the Foreman" lightbox | [PR #4](https://github.com/legertom/diy-reno/pull/4) | `509b468` |
| 5.8 | Timeline search + filter chips | [PR #5](https://github.com/legertom/diy-reno/pull/5) | (rebased to main) |

**🚨 BLOCKED on 5.11 — see [`BLOCKED.md`](./BLOCKED.md).** Per §3 item 6,
5.11 is the hard stop. I parked it with a concrete cost-cap question
(per-user daily cap + first-variant pick) and three options with
recommendations. Picking one unblocks ~$6–$12/mo of recurring AI
gateway spend.

**Deferred this run (decisions or scope, not blockers):**
- **5.7 same-angle pairing** — needs image-embedding provider pick. The
  embedding column is in `photo` but no producer wired. See `BLOCKED.md`
  follow-ups.
- **5.9 Foreman as photographer** — `getUserMedia()` framing overlay is
  the heavy bit; suggestions could be a lightweight follow-up.
- **5.10 paint-chip matching** — needs a curated paint DB or matching
  API decision.
- **5.12 / 5.13 / 5.14 / 5.15** — listed in `BLOCKED.md` follow-ups
  with rough scope notes.

**Tom-must-verify (every shipped PR has a "Tom-must-verify" section in
its body — these only run in your authenticated browser):**
- 5.1: mobile camera capture from home / task row / Foreman; full-screen
  swipe lightbox; EXIF date display; reorder; delete.
- 5.2: "Generate my dream" → image lands edge-to-edge; conversational
  style ("shaker white cabinets, brass fixtures, oak floors") triggers
  re-render; "Why this image?" reveals prompt.
- 5.3 / 5.4: upload a phone photo → vision pass returns caption + tags
  + ROI strip within ~3–5s; upload an electrical photo → "stop · call a
  pro" red overlay.
- 5.5: nominate a hero shot → home page gets Today / Dream toggle that
  cross-fades.
- 5.6: lightbox "Ask the Foreman" closes box, opens bubble with the
  photo attached, ready to send.
- 5.8: type "tile" in the timeline search → grid filters; safety chip
  filters to flagged photos.

**Exact next action when you resume:**
1. Read `BLOCKED.md`. Pick option 1, 2, or 3 (or tell me something else).
2. Mobile-verify the six shipped PRs against your phone — anything that
   doesn't behave, open an issue and I'll fix it before §5.11.
3. With your `BLOCKED.md` answer in hand, the next branch is
   `phase-5-11-variations` (or whatever the option dictates).

**Things this run is honest about:**
- I cannot drive your Google login, so every "verified" claim on a
  shipped PR is build-clean + pipeline-green + spot-checked on the
  preview URL where it doesn't need auth. The `Tom-must-verify`
  sections are the gap.
- The `setStyleProfile` Foreman tool was added but the system prompt
  doesn't yet aggressively prompt for style choices during intake —
  you may need to volunteer "I want shaker / brass / sage" before the
  dream personalizes.
- Each Vercel preview build re-applies the §5 migration pipeline to
  prod (idempotent, gated). That's ~3 seconds of Neon branch activity
  per build. Cheap but visible in Neon usage logs.

---

## 0. Thesis

The reason the user logs in is not to manage tasks. The reason the user
logs in is to see **their kitchen as it will be** — and to remember
that the grind of demo days and tile prep is in service of that image.
Photos in DIY Reno carry that loop: **dream → reality → dream.**

The Foreman's job, expressed in photos, is three-fold:

1. **Hold the vision** — keep a vivid, evolving AI render of the
   finished room as the home-screen hero, regenerated when major
   decisions land.
2. **Coach on what's real** — react to the user's own photos as the
   work happens; nudge, correct, celebrate, occasionally say "stop,
   call a pro."
3. **Close the gap** — show the path between today and the dream so
   the user can *see* progress, not just count tasks.

Decisions below are judged against this loop, in that order.

**Curation runs through the whole plan**, not as a single feature.
Smart crops (5.4), diptychs (5.7), hero shot of the week (5.9),
magazine spreads (5.13), and the final reveal (5.15) all feed a single
curation thread — surfaced together in §5.13's **Foreman's picks**.

---

## 1. Reconciling with `PLAN.md` §5

The original §5 ordering puts "AI renderings" last because they are
"the expensive outlier → gate/rate-limit" (PLAN §8.2). That rule still
holds — and the **dream hero (5.2)** does not break it, because:

- The dream is generated **once per major decision**, not per page
  view.
- It is **cached as a static asset** in Blob and served from CDN on
  every login at zero AI spend.
- The user *requests* re-renders implicitly (by making a decision); the
  app never re-renders speculatively.

So "expensive AI is gated" survives — but its placement in the build
order changes. The dream render moves *up*: it is the second sub-phase
of §5, right after foundation. The per-photo generative variations
(paint preview, material swap, product insertion) stay later, because
those *are* per-request spend.

---

## 2. Constraints carried in from `PLAN.md`

Unchanged — recap for the parts that bite hardest in photo work:

- **Coach, not project manager.** Photo affordances give the Foreman
  more to react to; they do not give the user more to manage.
- **No-pressure UI.** Dates are informational only ("3 weeks ago"),
  never countdowns. (`feedback_dates_anxiety.md`.)
- **Mobile-first.** Capture lives one tap from anywhere the user
  already is. The dream hero must look right on a phone before it
  looks right anywhere else.
- **Cost-gated AI.** Cached-once renders fine. Per-request renders
  gated with a daily cap and explicit user action.
- **Photo-led layout.** Edge-to-edge on mobile; chrome is hairlines.
- **Privacy.** Project-scoped; never indexed beyond project members;
  Blob orphans cleaned on row delete.

---

## 3. Build order

### 5.1  Foundation — timeline, capture, attach

> ✓ **5.1 shipped** — `c2eda67` (PR #1, 2026-05-24).

The scaffolding everything else stands on. No AI yet. **~60% already
in code** — see PHOTO_EXECUTION_PROMPT §0 for what's shipped.

- [ ] Photo upload via Vercel Blob client-upload, project-scoped *(done)*
- [x] EXIF extraction at upload — `takenAt`, orientation; **no GPS UI**
- [x] Project-level timeline view — chronological, edge-to-edge grid,
      full-screen swipe
- [x] Attach optional `room` and/or `task` references on a photo
- [x] Camera button reachable from project home, task row, and Foreman
      thread
- [x] Delete + reorder; **cascade Blob delete on row delete**
      (verify by deleting a test task / project)

Exit: user can shoot or upload, see photos in order, and delete without
leaving Blob orphans.

### 5.2  Dream hero — the home-screen render

> ✓ **5.2 shipped** — pending merge (PR #2, 2026-05-24). Core loop
> in: render, cache, "why this image?", manual + style-change
> triggers, conversational `setStyleProfile`. Three variations,
> wallpaper export, and Sunday postcard remain as follow-ups.

The new headline. The user's first reason to open the app. **Provider:
Gemini image via Vercel AI Gateway (locked, §5).**

- [x] Render pipeline: project `styleProfile` (see §5 for shape) +
      room kind → Gemini image via AI Gateway
- [ ] **Three variations** offered at intake end ("warmer / cooler /
      bolder"); user picks one; that becomes the project's north star.
      Extends Phase 4's conversational intake.
- [x] Cached as a static Blob asset per project; served from CDN on
      every login at zero AI spend
- [x] **Decision-triggered re-render** — fires on any `dreamTrigger`
      event (see §5). Cooldown so the dream is not flickering.
- [x] **Home-screen treatment** — post-login `/` becomes the dream as
      the edge-to-edge hero. Task list demotes to a sidecar. One
      Foreman line beneath the image ("one tile-prep day brings you
      closer to this"). This is an IA shift — the photo-led visual
      language from PLAN §3.4 was waiting for this moment.
- [ ] **Wallpaper export** — share as phone lock screen / desktop
      wallpaper. The dream literally follows the user around.
- [ ] **Sunday postcard ritual** — the dream is regenerated quietly on
      Sunday morning, framed as a "postcard from your future kitchen."
      **Off by default**, opt-in (§5).
- [x] **"Why this image?"** — tap the dream to see what choices
      informed it ("based on: shaker fronts, Carrara, sage walls").
      Tappable choices → edit them, re-render.
- [ ] **Quality reassessment** — after the first 20 renders, audit
      "same kitchen evolving" against the §5.2 thesis. If failing,
      raise to Tom for provider switch (FLUX Kontext is the fallback).

Exit: the user logs in and sees the kitchen they're working toward.
The image evolves with their decisions, never with their guilt.

### 5.3  Passive AI — captions, tags, OCR, safety

> ✓ **5.3 shipped** — pending merge (PR #2 stacked, 2026-05-24).
> Core vision pass in: caption, tags, ROIs (5.4 substrate), safety
> flags. Receipt mode + "What is this?" long-press remain as
> follow-ups. Embedding column is in the schema but unpopulated
> until 5.7 consumes it.

The intelligence the user never asks for. Ships in parallel with 5.2
because it is the substrate for everything from 5.6 onward. **Provider:
Gemini Flash via Vercel AI Gateway (locked, §5).**

- [x] Vision → short factual auto-caption ("North wall, drywall
      removed")
- [x] Vision → tags: room kind, surface, materials, tools, phase
- [ ] Vision embeddings cached on the row — feeds 5.7
- [ ] **Receipt mode** — when a photo *is* a receipt, extract line
      items + total. Lines with confidence ≥ 0.85 auto-accept; below,
      user confirms each. (§5)
- [ ] **"What is this?"** — long-press → vision identifies the object
      + brief context. Direct extension of the existing
      `identify-tools` pattern.
- [x] **Safety flags** — vision quietly flags electrical, structural,
      mold, asbestos, code-violation cues with a "stop, call a pro"
      overlay. Quiet but firm; credibility comes from the no's.

Exit: every photo is searchable, captioned, and embedded at upload
cost. Receipts stop being a chore. Dangerous work gets a no.

### 5.4  Smart crops & details — what the Foreman noticed

> ✓ **5.4 shipped (substrate)** — pending merge (PR #2 stacked,
> 2026-05-24). ROI bbox + category + caption land on the row via
> the same 5.3 vision call. Detail strip renders as CSS
> object-position crops in the lightbox. Per-ROI embedding + per-
> ROI Foreman thread remain as follow-ups (need 5.6 thread infra).

The same vision pass that captioned and tagged the photo in 5.3 also
returns 3–5 **regions of interest** with category labels. The Foreman
volunteers them — "I noticed these…" — instead of waiting for the user
to point. Cheap (same vision call, just extended), and compounds into
5.5, 5.7, 5.9, 5.13.

- [x] Vision returns ROI bounding boxes + category per photo on
      upload, in the same call as 5.3's captions / tags / embeddings
- [x] Categories: **defect, transition, progress, moment, safety**
- [x] **Detail strip** beneath the full photo — 3–5 cropped thumbnails,
      each with a one-line "what Foreman saw" caption
- [x] Crops are CSS `object-position` overlays on the source image;
      **no extra Blob writes**
- [ ] Each ROI gets its own embedding (feeds 5.7 same-angle pairing at
      region level — not only whole-image matching)
- [ ] Optional **per-ROI Foreman thread** — finer grain than 5.6's
      per-photo thread. "Ask about this corner."
- [x] Storage: JSON column on `photo` (`rois: { id, bbox, category,
      caption, embedding }[]`). Migrate to table later if usage grows.
- [x] Threshold conservative — false negatives over false positives.
      A wrong ROI is worse than no ROI.

Exit: every uploaded photo arrives with a "Foreman noticed these…"
strip. The Foreman has finer-grained things to react to without the
user pointing.

### 5.5  Reality-vs-dream loop

> ✓ **5.5 (today↔dream toggle) shipped** — pending merge (PR #3,
> 2026-05-24). Hero-shot nomination + toggle between today's view
> and the dream on the home page. Punch list, try-before-you-buy,
> and realistic intermediate all need the 5.11 per-request render
> path — they wait there.

The compounding move on 5.2. Makes the dream interactive instead of
decorative.

- [x] **Hero shot of current state** — user nominates one photo as
      "today's view of the room" (one tap; changeable anytime)
- [x] **Scrub between today and dream** — drag your thumb across the
      home-screen image to time-travel between the two
- [ ] **"What's left?"** — Foreman compares hero shot to dream and
      surfaces visible remaining work as a punch list (visual chips,
      not a checklist). **Uses 5.4's ROI for precision** — points at
      the exact corner that needs work, not just "the backsplash."
- [ ] **Try-before-you-buy** — render a candidate product/finish into
      the dream *and* into today's hero shot; let the user live with
      both for a day
- [ ] **Realistic intermediate** — "if you stopped today, here is what
      your kitchen actually looks like" rendered beside "one step
      further toward the dream"

Exit: the dream is no longer a static poster; it is the other end of a
visible, scrubbable journey.

### 5.6  Photo critique — Foreman on real work

> ✓ **5.6 (drop-into-chat) shipped** — pending merge (PR #4,
> 2026-05-24). Lightbox "Ask the Foreman" button closes the lightbox
> and opens the project-level Foreman bubble with the photo pre-
> attached. Uses the existing multimodal chat + task tools — no
> per-photo persistent thread yet; that becomes a follow-up if the
> in-chat flow doesn't meet the need.

Cheapest vision-to-text Foreman interaction. Highest pain relief for
the solo DIYer wondering "did I do this right?"

- [ ] Per-photo Foreman thread, pinned to the photo
- [x] "Look at my work" entrypoint on every photo — one button,
      thumb-reachable
- [x] Foreman's response uses the existing character/voice and can
      produce tasks via the existing task tools
- [x] Drop a photo into the project-level Foreman chat as a soft
      reference; carries its tags AND its ROIs (from 5.4) into the
      prompt

Exit: photos are conversational objects; the Foreman can coach on real
work without the user typing a paragraph.

### 5.7  Same-angle pairing — the unprompted "wow"

Uses the embeddings from 5.3 (whole-image) and 5.4 (per-ROI).

- [ ] On upload, match against prior project photos within a
      conservative threshold (**0.85 cosine similarity to start**;
      tune from telemetry — §5)
- [ ] When matched, **auto-create a progress diptych** and surface
      it on the timeline
- [ ] **ROI-level pairing** — match individual regions across time
      even if the wide-shot framings drifted (compounds 5.4)
- [ ] **Timeline scrubber** through a single viewpoint over time
- [ ] Manual pair / unpair override
- [ ] Threshold defaults conservative — **false negatives over false
      positives.** A wrong pair is worse than no pair.

Exit: progress reveals itself without the user filing anything.

### 5.8  Organization — clusters, search, photo → task

> ✓ **5.8 (search + filter) shipped** — pending merge (PR #5,
> 2026-05-24). Free-text search + room / tag / safety filter chips
> on the timeline; lightbox respects the filter so swipe stays
> in-set. Auto-cluster, photo→task draft, bulk select remain as
> follow-ups (photo→task gets the 5.6 Ask-the-Foreman flow for
> now — say "make this corner a task" with the photo attached).

The tags from 5.3 finally earn their cost.

- [ ] Auto-cluster by room and phase
- [x] Filter chips + free-text search across captions, tags, AND
      ROI captions (so a search hits "tile spacing" even if only an
      ROI mentioned it)
- [ ] **Photo → task draft** — detected issues (mostly ROIs in the
      `defect` category) become one-tap-accept draft tasks
      ("touch up baseboard, NW corner")
- [ ] Bulk select for moves/deletes

Exit: "show me all my tile photos" works; the photo set becomes a
useful index, not a pile.

### 5.9  Foreman as photographer

The active coaching layer on top of 5.7.

- [ ] **Shoot suggestions** — "we have a tile shot from 3 weeks ago at
      this angle; reshoot it tonight for next month's diptych"
- [ ] **Live framing overlay** on the camera when reshooting a paired
      angle — Foreman shows the older frame as a ghost
- [ ] **Hero shot of the week** — Foreman picks one image from the
      week's uploads and presents it in the magazine-spread treatment
      (PLAN §3.4). **May pick a 5.4 detail crop**, not only a full
      photo.
- [ ] **Worth-photographing nudges** — Foreman occasionally suggests a
      shot ("get a wide of the corner now, before the cabinets go in").
      Opt-in, sparingly, never push notifications.

Exit: the Foreman is not only reacting to photos — it is helping the
user take the photos that will pay off later.

### 5.10  Choice matching by photo

Vision-driven product / inspiration flows.

- [ ] **Paint chip → matches** across brands + prices
- [ ] **Inspiration photo** (magazine page, Pinterest screenshot) →
      real products the user can buy, in stock and in budget
- [ ] **Two competing products side-by-side**, auto-staged in the
      user's room (uses 5.11's per-request render path)
- [ ] **Friend's-kitchen sample** — "lean my dream in that direction"

Exit: photos are how the user shops, not only how they document.

### 5.11  Targeted generative variations (cost-gated)

The original PLAN.md §5 "AI renderings" line, narrowed. Per-request,
ordered by reliability and cost. **Stop and confirm with Tom before
shipping this sub-phase** — it commits material cost.

- [ ] **Paint preview** — wall mask + recolor. Cheapest, highest hit
      rate.
- [ ] **Material swap** — floor, backsplash, counter; against a small
      curated material library to keep prompts predictable.
- [ ] **Empty the room** — object removal for planning against a blank
      canvas.
- [ ] **Side-by-side variations** — three colors or three tiles in the
      same editorial grid.
- [ ] **Product insertion** — user picks a product (image v1; URL
      fetch later); composited at correct scale and lighting. Most
      expensive, most prone to mis-scale; ship last in this group.

All gated by: explicit "render" CTA, per-user daily cap, clear cost
surface so the user understands what triggered a render.

Exit: the user can see a choice *in their own room* before committing
money to it, within a bounded monthly spend.

### 5.12  Annotation & measurement

Foreman drawing directly on photos; user-side tools too.

- [ ] **Foreman annotates** — arrows, circles, text directly on a
      photo ("this grout joint is too wide")
- [ ] **Spot-the-mistake mode** — Foreman highlights issues visually
      before saying anything in text (extension of 5.4's `defect`
      ROIs)
- [ ] **Pinch-zoom-aware critique** — Foreman responds to what the
      user is zoomed into, not the whole image
- [ ] **Measurement from photo** — tap two points + a known reference
      object → approximate distance
- [ ] **Reference images** pulled inline ("good tile spacing looks
      like this")

Exit: critique becomes visual, not only textual. The user can measure
without a tape if needed.

### 5.13  Storytelling layer

> ✓ **5.13 Foreman's picks v0 shipped** — pending merge (PR #6,
> 2026-05-24). The capstone surface lands first; magazine cover,
> photo essay, time-lapse, "on this day," and shareable postcards
> remain as follow-ups.

Delight. Quiet, opt-in, never a leaderboard. **The home of curation
across the whole plan.**

- [ ] **Monthly magazine cover** — your kitchen-to-be styled as a
      Vogue Living spread. Frame-able.
- [ ] **End-of-phase photo essay** — auto-curated, editorial layout
- [ ] **Time-lapse stitch** of the whole project
- [ ] **"On this day"** — a photo from one month / three months ago
- [ ] **Shareable postcards** with hairline-rule chrome for partner /
      family / a Slack channel
- [x] **Foreman's picks** — the capstone. A single curated view that
      pulls diptychs (5.7), hero shots (5.9), smart-crop highlights
      (5.4), magazine spreads from this section, and the dream
      regeneration history. The "best of" surface the user shows
      friends.

Exit: progress feels narrated. The reality-TV-website lens lands.

### 5.14  Floor-plan ingestion

The final PLAN.md §5 line. Vision → structured Property data.

- [ ] User uploads a sketch or contractor drawing
- [ ] Vision extracts: room list, adjacencies, approximate dimensions
      where labeled
- [ ] Writes into Property's nullable floor-plan / measurement fields
      (already provisioned in Phase 1)
- [ ] Owner confirms each extracted room before it lands

Exit: Property carries structured rooms without manual entry.

### 5.15  Closers — the reveal moment

End-of-project moments. The reality-TV finale, private and earned.

- [ ] **Final reveal album** — designed end-to-end
- [ ] **Foreman's letter** — short, photo-led, written on completion
- [ ] **Hall of fame** — the user's best progress moments, kept

Exit: when the project is done, the project celebrates the project.

---

## 4. Cross-cutting

- **Cost discipline.** Caption / tag / embedding / ROI / safety
  calls run *once per upload* and cache on the row. The dream hero
  caches per-project, regenerated only on `dreamTriggers`. Only
  §5.11 variations are per-request spend.
- **Privacy.** Face / window-view blurring runs at export, not at
  storage.
- **Mobile capture.** Direct shoot on every photo entrypoint.
- **Dates.** "3 weeks ago" only.
- **Voice.** Warm, honest, willing to say "stop, call a pro" —
  consistent across critique (5.6), Foreman-as-photographer (5.9),
  safety flags (5.3), and ROI-level critique (5.4 / 5.12).
- **Home-screen IA.** 5.2 is also a design change: the home becomes
  the dream + scrub. Coordinate with whatever PLAN.md Phase 3 left
  pending (mobile-viewport pass).

---

## 5. Decisions (locked 2026-05-24)

All seven open questions resolved by the owner. The overnight agent
operates from these — do not re-raise unless implementation reveals a
specific blocker.

### Q1 — Generative provider for the dream hero (5.2)

**Gemini image via Vercel AI Gateway.** Cheapest of the candidates,
Vercel-native, room preservation reasonable. After the first 20 dream
renders ship, audit "same kitchen evolving" quality against §5.2's
exit criterion. If failing, raise to Tom — FLUX Kontext is the
fallback.

### Q2 — `styleProfile` data shape

```ts
{
  palette: string[]            // 3-5 hex values
  finishes: {
    cabinets?: string          // e.g. "shaker, white"
    counters?: string          // e.g. "Carrara marble"
    floors?: string            // e.g. "natural oak herringbone"
    fixtures?: string          // e.g. "polished brass"
    backsplash?: string
    walls?: string             // paint name or color
  }
  vibe: string                 // freeform from intake
  referenceImages?: string[]   // 0-3 inspiration Blob URLs
  dimensionsHint?: string      // "small galley" / "open concept" — optional
}
```

Stored on `project` (column `style_profile JSONB`). Populated by the
Phase 4 intake interview. Editable from the "why this image?"
affordance in 5.2.

### Q3 — `dreamTriggers` list

Start narrow. Specific observable user actions only — no fuzzy
detection.

- Any structured field in `styleProfile` changes
- A reference image added or removed
- User hits a manual **"update my dream"** button on the home screen

That's it. No detection of paint colors from chat, no detection of
"layout decisions" from natural language. Add more triggers later
only if a clear signal exists.

### Q4 — Vision provider for §5.3

**Gemini Flash via Vercel AI Gateway.** Same gateway, separate model,
cheap. Captions / tags / embeddings / ROI all in one call.

### Q5 — Same-angle threshold (5.7)

**0.85 cosine similarity to start.** Tune from telemetry once enough
real pairs exist. Conservative — false negatives over false
positives. A wrong pair is worse than no pair.

### Q6 — Receipt confidence floor (5.3)

**Auto-accept lines ≥ 0.85 confidence**; user manually confirms below.

### Q7 — Sunday postcard cadence

**Opt-in. Off by default.** Anxiety-aware default per
`feedback_dates_anxiety.md` — even positive surprises require opt-in.

---

## 6. What is NOT in this plan

- **Sharing beyond project members.** Out of scope; PLAN §8.5 stands.
- **Live AR / on-device room scanning.** Web-first.
- **Multi-project photo libraries** at the Property level. Stays lazy.
- **Heavy plan generation from photos.** Stays deferred per `PLAN.md`.
- **Push notifications** for any of this. In-app cards only.
- **Detection of paint / material decisions from natural language**
  in Foreman chat. Triggers (§5 Q3) stay explicit only.

---

## 7. The first units to build

In order, after merging:

1. **5.1 Foundation** — finish the ~40% gap (project-level timeline,
   EXIF, room-attach, project-home camera button, cascade delete).
2. **5.2 Dream hero** — the new headline. Tom told us this is *why
   he would open the app.* Land this and the home screen becomes
   the thing that makes the rest of Phase 5 feel earned.
3. **5.3 Passive AI** — ships in parallel with 5.2; substrate for
   everything from 5.6 onward.
4. **5.4 Smart crops & details** — extends 5.3's vision pass with
   ROI; volunteers detail moments. Compounds into 5.5, 5.6, 5.7,
   5.8, 5.12, 5.13.
5. **5.5 Reality-vs-dream loop** — compounds 5.2 directly; turns
   the dream from a poster into a journey. ROI-aware punch list.

Everything from 5.6 onward depends on these five being real and used.
Critique (5.6), same-angle pairing (5.7), and product insertion (last
item in 5.11) are the next three real units after the loop is in
place — but the **headline of Phase 5 is no longer "critique" or
"renderings."** It is **the dream you see when you log in.**
