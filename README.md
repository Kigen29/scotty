# Scotty

[![CI](https://github.com/Kigen29/scotty/actions/workflows/ci.yml/badge.svg)](https://github.com/Kigen29/scotty/actions/workflows/ci.yml)
[![Security](https://github.com/Kigen29/scotty/actions/workflows/security.yml/badge.svg)](https://github.com/Kigen29/scotty/actions/workflows/security.yml)

Autonomous lead discovery and outreach for a Kenyan software studio.

Scotty finds small businesses that have no website or internal systems, scores them
against an ideal-customer profile, writes a personalised pitch for each one, sends it,
and tracks what comes back — so the work of prospecting runs without being driven by hand.

Services being pitched: system development, mobile app development, and general software
engineering — websites that establish an online presence, plus inventory management,
client acquisition, analytics, and SEO.

Reference work: lakevictoriaaquaculture.com, heartbeestsafaris.com, rangautiles.com,
itchyfeet.co.ke.

## How it works

| Stage | What happens |
|---|---|
| **Discover** | Search Kenyan businesses by category and city, keeping only those with no website |
| **Qualify** | Score against the ICP profile; verify email addresses; enrich from any page that exists |
| **Compose** | Draft a per-business pitch referencing their specific situation and relevant past work |
| **Send** | Deliver over email (Resend) or WhatsApp, inside a daily cap |
| **Track** | Record opens, bounces, and complaints |
| **Converse** | Classify replies by intent and draft a response |

## Stack

- **Frontend** — React 18, Vite, TypeScript, Tailwind, shadcn/ui
- **Backend** — Vercel functions in `api/` on Neon Postgres (schema `scotty`, shared with code5developers.com). Moved off Lovable's managed Supabase in November 2026.
- **Scheduling** — none while the old jobs are rebuilt; Vercel Cron when they return
- **Legacy** — `supabase/` holds the old Deno edge functions and migrations, kept as the reference the rebuild ports from
- **External** — Firecrawl (search and scrape), AI gateway and OpenAI (extraction, scoring, copy), Resend (email), Meta WhatsApp Cloud API

## Layout

```
src/
  pages/          One screen per route: Dashboard, LeadDiscovery, Campaigns,
                  Sequences, Pipeline, Conversations, Reports, Deliverability, Settings
  components/     Shared UI; components/ui is shadcn
  hooks/          Auth, realtime subscriptions, notifications, team
  integrations/   Data client (Supabase-style API over Scotty's own endpoints) and table types
api/
  db.ts           Data endpoint; _lib/query.ts turns calls into scoped, parameterised SQL
  auth.ts         Single-operator sign-in
  fn/[name].ts    Actions (discovery, drafting, sending) as they are rebuilt
supabase/         Legacy edge functions and migrations, the reference for the rebuild
```

## Running locally

Requires Node.js 20+.

```sh
npm install
vercel link                    # once, to the "scotty" project
vercel env pull .env.local     # server settings
vercel dev                     # app + api on http://localhost:3000
```

Other scripts:

```sh
npm run build        # production build
npm run lint         # eslint
npm test             # vitest, single run
npm run test:watch   # vitest, watch mode
```

## Configuration

The `api/` functions read their settings from the Vercel project; `.env.example` lists them.
There is nothing secret in the frontend: it talks only to its own `/api`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres. Scotty's tables are in the `scotty` schema |
| `OPERATOR_USER_ID`, `OPERATOR_EMAIL` | The single operator: owns every row, signs in with this email |
| `SCOTTY_PASSWORD`, `SCOTTY_SECRET` | Sign-in password, and the key that signs the session cookie |

> **Note:** `vercel dev` runs against the live database. There is no separate dev copy yet.

## Documentation

| Document | Covers |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch naming, commit format, changesets, running the checks |
| [docs/ci.md](docs/ci.md) | Every CI job, why it exists, what to do when it is red |
| [src/README.md](src/README.md) | Frontend structure, routes, design tokens, conventions |
| [supabase/README.md](supabase/README.md) | All 18 edge functions, secrets, migrations, schema |
| [.changeset/README.md](.changeset/README.md) | How to write a release note and pick a bump level |

## Contributing

Everything goes on a branch and through a pull request — never straight to
`main`. Branches are named `<type>/<description>` (`feat/`, `fix/`, `docs/`,
`chore/`, `refactor/`, `test/`, `ci/`, `perf/`, `security/`), PR titles are
conventional commits, and changes that ship behaviour need a changeset. CI
enforces all three.

```sh
npm run verify       # lint + typecheck + test + build, same as CI
npm run edge:check   # type-check the 18 Deno edge functions
npm run changeset    # write the release note
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first PR.

## Status

Rebuilding on Neon. Every screen reads and edits real data again, but the actions that ran as
edge functions (discovery, drafting, sending, the outreach agent) are being ported to `api/fn`
one at a time, and report that until they return. Nothing sends email meanwhile. Next: website
enquiries flowing into Conversations, replies sent only after approval, then discovery from
Google Places and permission-first outreach.
