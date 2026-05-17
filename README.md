# DIY Reno

A renovation planner and on-site foreman. Plan a job in phases, work a
day-by-day schedule, check tasks off, log hours, snap photos, keep a buy
list, and ask a multimodal AI renovation expert ("The Foreman") for help on
any step. Share a project with a partner, friend, helper, or contractor.

Designed mobile-first — built for a phone on a dusty job site — with an
architect's-blueprint / high-end-real-estate aesthetic.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · Tailwind v4 |
| Auth | Auth.js v5 — Google sign-in |
| Database | Neon Postgres (Vercel Marketplace) · Drizzle ORM |
| Photos | Vercel Blob |
| AI | Vercel AI SDK v6 · Vercel AI Gateway (`anthropic/claude-sonnet-4.6`) |

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run db:push              # create tables in Neon
npm run db:seed              # seed the Kitchen Renovation plan
npm run dev
```

### Environment variables (`.env.local`)

- `DATABASE_URL` — Neon Postgres connection string.
- `AUTH_SECRET` — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google Cloud → APIs & Services →
  Credentials → **OAuth client ID** → *Web application*. Authorized redirect
  URIs: `http://localhost:3000/api/auth/callback/google` and
  `https://YOUR-DOMAIN/api/auth/callback/google`.
- `AI_GATEWAY_API_KEY` — Vercel dashboard → AI Gateway → API key. Injected
  automatically on Vercel deployments; only needed for local dev.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob store token. Injected automatically
  on Vercel; only needed for local dev.
- `AI_MODEL` *(optional)* — defaults to `anthropic/claude-sonnet-4.6`.

### The seeded Kitchen plan

`npm run db:seed` creates a user row for `tomleger@gmail.com` (override with
`SEED_OWNER_EMAIL`) and the full 27-task Kitchen Renovation. Google sign-in
links to that pre-seeded user by email, so on first login the project is
already there. The seed is re-runnable (it replaces the existing copy).

## Deploy to Vercel

The Vercel CLI is the smoothest path (`npm i -g vercel`):

```bash
vercel link                                  # link/create the project
vercel integration add neon                  # provision Postgres (sets DATABASE_URL)
# create a Blob store + AI Gateway key in the dashboard, add Google creds:
vercel env add AUTH_SECRET production preview development
vercel env add AUTH_GOOGLE_ID production preview development
vercel env add AUTH_GOOGLE_SECRET production preview development
vercel env pull .env.local --yes             # sync everything locally
npm run db:push && npm run db:seed           # apply schema + seed
vercel deploy --prod
```

Or push to GitHub and import the repo in the Vercel dashboard, then add the
same environment variables and run `db:push` / `db:seed` against the Neon
database (e.g. locally after `vercel env pull`).

After deploying, add your production callback URL
(`https://YOUR-DOMAIN/api/auth/callback/google`) to the Google OAuth client.

## Roadmap

- **AI plan generation** (phase 2): describe a project and have The Foreman
  scaffold phases, tasks, schedule, tools, and safety. Good fit for the
  Vercel Workflow DevKit / `DurableAgent` (long, resumable generation).
