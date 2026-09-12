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
- **Backend** — Supabase: Postgres with row-level security, Auth, Realtime, Deno edge functions
- **Scheduling** — `pg_cron` + `pg_net`
- **External** — Firecrawl (search and scrape), AI gateway and OpenAI (extraction, scoring, copy), Resend (email), Meta WhatsApp Cloud API

## Layout

```
src/
  pages/          One screen per route: Dashboard, LeadDiscovery, Campaigns,
                  Sequences, Pipeline, Conversations, Reports, Deliverability, Settings
  components/     Shared UI; components/ui is shadcn
  hooks/          Auth, realtime subscriptions, notifications, team
  integrations/   Generated Supabase client and types
supabase/
  functions/      Edge functions — discovery, qualification, sending, webhooks
  migrations/     Schema and RLS policies
```

## Running locally

Requires Node.js 20+.

```sh
npm install
npm run dev          # http://localhost:8080
```

Other scripts:

```sh
npm run build        # production build
npm run lint         # eslint
npm test             # vitest, single run
npm run test:watch   # vitest, watch mode
```

## Configuration

`.env` holds the Supabase connection for the frontend:

```
VITE_SUPABASE_URL
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
```

Edge functions read their own secrets from the Supabase project, never from `.env`:
`FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
`WHATSAPP_BUSINESS_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and `CRON_SECRET`.

> **Note:** `.env` points at the hosted Supabase project. A local dev server is a
> frontend onto live production data — run `supabase start` if you want an isolated
> database to work against.

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

Under active development. The outbound path (discover → score → compose → send → track)
is working. Inbound email ingestion and automated reply handling are not yet wired, so
the conversation half of the loop is incomplete. See the architecture review for the
current findings and the phased plan.
