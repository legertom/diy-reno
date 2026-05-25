# Blocked: 5.11 — per-request generative renders need your cost ceiling + first-variant pick

**Where I am:** `main` is current at `<latest sha after this commit>`. Overnight run shipped 5.1, 5.2, 5.3, 5.4 substrate, 5.5, 5.6, 5.8 — six PRs (#1–#5) merged into prod via the §5 pipeline, all green. The dream-hero is rendering, the Foreman is critiquing photos and writing tasks, the timeline is searchable, today↔dream scrubs on the home page. Detailed status in `PHOTO_PLAN.md` overnight-run block.

**The decision:** Before any code lands for §5.11 ("targeted generative variations"), you need to choose two things:

1. **Per-user daily cap** — every entrypoint must have one from day one (your rule from `PHOTO_PLAN.md` §2). I don't have a number from you yet.
2. **First variant** — the §5.11 list is ordered cheapest-first (paint preview → material swap → empty room → side-by-side → product insertion). Shipping all five together is one PR's worth of UI but five different prompt regimes. Shipping just paint preview first is a tight learnable v0.

Cost model for context (Gemini 2.5 Flash Image / "Nano Banana" via AI Gateway, the locked dream provider):

| Render | Approx. cost | Rough volume to budget |
|---|---|---|
| 1 render | ~$0.04 | — |
| Daily cap of 5 | ~$0.20/day | $6/month |
| Daily cap of 10 | ~$0.40/day | $12/month |
| Daily cap of 20 | ~$0.80/day | $24/month |
| Product insertion (heavier prompts) | ~1.5× | add 50% |

You said free-tier / Vercel-native bias in `user_preferences.md`. AI Gateway billing is per-token; image gen is per-call. There's no free tier for image gen so this is unavoidably the first non-zero recurring cost in the app.

**Options:**

1. **Tight v0 — paint preview only, cap=5/day, ~$6/mo ceiling.** Smallest blast radius. Lets us learn the mask-+-recolor pattern before committing UI to four more variants. Cost is small enough you barely notice. Risk: feels incomplete next to the dream hero / critique / search work.
2. **Full §5.11 lineup, cap=10/day, ~$12/mo ceiling.** All five variants behind one "Try this in your room" entrypoint. Bigger PR, more prompt engineering up front. The five variants share a lot of UI (an editorial side-by-side grid is reusable). Risk: $12/mo isn't free, but it's still tiny vs. the credibility of "render any choice into the room before buying."
3. **Paint preview + material swap, cap=10/day, ~$12/mo ceiling.** The two cheapest, highest-hit-rate variants. Defers product insertion (the most prone to mis-scale, your call to ship last anyway). My pick if you want middle ground.

**My recommendation:** **Option 3.** Lands the two most-useful variants together (paint and material both target finishes — the same affordance shape), gives a real daily cap to watch, leaves product insertion for a deliberate later sub-phase once you've seen ROI behavior live. The dream loop is the headline of Phase 5; §5.11 is the per-room try-on, not the centerpiece — it shouldn't grow until you've used the cheaper variants and decided what's worth the extra spend.

**If you say yes, I'll:**
1. Add a `generation_log` table (project_id, user_id, kind, created_at, cost_estimate_cents) so the daily cap is enforced server-side and you have an audit trail.
2. Wire `renderPaintPreview(photoId, color)` + `renderMaterialSwap(photoId, kind, material)` via Gemini 2.5 Flash Image (same provider as the dream).
3. Add a "Try this in your room" entrypoint in the lightbox (canWrite, non-default — gated behind a `Sparkles` icon so it's never an accidental click).
4. Surface today's spend + remaining cap in the dream-hero "Why this image?" panel so you always see what you've used.
5. Stop and write a second `BLOCKED.md` before any product-insertion work.

Want me to spin this up on `phase-5-11-variations` next session? Say "yes do option N" or "do something else" — I'll branch from main and follow that.

---

## Other follow-ups parked for later (not blocking)

These don't need a decision but are flagged so they don't fall off:

- **5.7 same-angle pairing** — needs an image-embedding provider choice. Skipped this run because the embedding column is in the schema (`drizzle/0006_photo_passive_vision.sql`) but no producer is wired. Candidates: `google/text-embedding-004` (cheap, but text-only — would have to embed our AI caption), or a dedicated image embedder via the Gateway. Pairs naturally with 5.9 "live framing overlay."
- **5.9 Foreman as photographer** — shoot suggestions are easy (heuristic over taken_at + room coverage); live framing overlay needs `getUserMedia()` work; hero-shot-of-the-week needs a weekly job (`vercel.json` cron).
- **5.10 paint chip → matches** — needs a curated paint database or an external matching API; not in scope this run.
- **5.12 annotation + measurement** — useful when 5.11 lands (annotation calls share infra).
- **5.13 Foreman's picks (capstone)** — partially ready: hero shot + dream + diptychs (5.7) + magazine spreads (deferred). A v0 page that just shows hero + dream + recent "moment"-category ROIs would land in a small PR.
- **5.14 floor-plan ingestion** — Property has nullable `floor_plan_url` ready (§1 schema). Vision extraction is a single Gemini Flash call; UI for "confirm each extracted room" is the harder bit.
- **5.15 closers** — end-of-project surface; no urgency until you're near "done enough" (July 1).

All of these compound nicely on the §5.11 cost-cap infra (generation_log + per-user cap), which is why §5.11 should land first.
