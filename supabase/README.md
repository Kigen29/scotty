# Backend

Supabase: Postgres with row-level security, Auth, Realtime, and 18 Deno edge
functions. `pg_cron` + `pg_net` drive the autonomous behaviour.

```
supabase/
  config.toml       function-level JWT settings
  functions/        18 Deno edge functions
    deno.json       local/CI type-checking config (the runtime ignores it)
  migrations/       23 SQL files — schema, RLS, triggers
```

## The 18 functions

Grouped by role. **Bold** entries have a problem described in the architecture
review.

### Discovery

| Function | Trigger | Source |
| --- | --- | --- |
| `discover-leads` | manual, from the UI | Firecrawl search, AI fallback |
| `auto-discover` | cron | Firecrawl with Google-Maps-shaped queries |
| **`ai-discover`** | cron, via `auto-discover` | **none — it prompts an LLM to invent businesses** |
| `social-discover` | cron, chained | Instagram / TikTok via Firecrawl |

> `ai-discover` asks a model to "generate 5–8 realistic business leads" with
> "realistic Kenyan phone number formats" and to "infer email addresses", then
> inserts the output as `status: 'qualified'` and lets the sender mail it. Cut
> this path before running the cron again. It is Phase 0 item one.

### Qualification

| Function | Trigger | Does |
| --- | --- | --- |
| `analyze-lead` | manual | The **only** ICP-weighted scorer. Writes `icp_score` |
| `enrich-lead` | manual | Scrapes a known page for extra detail |
| `verify-email` | manual | Syntax, disposable domains, role-based prefixes, MX lookup |

> Two competing scoring systems: `analyze-lead` uses your configured
> `icp_profiles` weights, but all three autonomous discovery paths instead ask an
> LLM inline for a 1–10 `priority_score` — and that is what the senders sort on.
> Your ICP sliders do not currently affect the agent.

### Composing and sending

| Function | Trigger | Channels |
| --- | --- | --- |
| `generate-email` | manual | email |
| `send-email` | manual | email — **strictest guards of the four senders** |
| `daily-outreach` | cron | email, WhatsApp, Instagram DM, LinkedIn |
| `auto-follow-up` | cron | email — drains drafts, then a 3-step cadence |
| `process-sequences` | cron | email — a third cadence engine |
| `generate-sequence-steps` | manual | authoring helper |

> Four send paths with four different rulebooks. Only `send-email` blocks on
> failed email verification; only the cron three check `unsubscribed`; **none**
> respect `active_hours_start` / `active_hours_end`, which the UI collects and
> nothing reads. `daily-outreach` counts drafts *created* against the daily cap
> while `auto-follow-up` counts mails *sent*, so they compute different
> remaining quotas and can jointly exceed the limit. Consolidating this into one
> shared gate is Phase 1.

### Inbound and tracking

| Function | Trigger | Does |
| --- | --- | --- |
| `resend-webhook` | Resend | `opened`, `delivered`, `bounced`, `complained`. Svix-verified |
| `whatsapp-webhook` | Meta | Statuses and inbound messages. HMAC-SHA256 verified |
| **`classify-response`** | **nothing** | Classifies reply intent, drafts a response |

> `classify-response` has **zero callers** — not the UI, not either webhook, not
> cron. And there is no inbound email path at all, so an owner who replies by
> email is invisible to the system. Together these mean the "establish a
> conversation" half of the product does not exist. Phase 2.

### Team

| Function | Trigger | Does |
| --- | --- | --- |
| `team-management` | manual | Create team, invite, join, role changes |
| `notify-assignment` | manual | Emails the assignee |

> Both write data no teammate can read back: every RLS policy is still
> `auth.uid() = user_id`.

## Turning autonomy off and on

The five scheduled functions — `auto-discover`, `social-discover`,
`daily-outreach`, `auto-follow-up`, `process-sequences` — refuse to do anything
unless the project sets:

```
AUTONOMY_ENABLED=true
```

**Absence of the secret means disabled.** They return
`{ skipped: true, reason: ... }` and exit before touching the database, so a
`pg_cron` job still firing on a schedule nobody can find is harmless.

Manual, user-triggered functions are unaffected: discovery from the UI, drafting,
sending a single campaign and both webhooks all keep working.

This exists because the `pg_cron` schedule lives in the hosting provider's
dashboard rather than in this repository (see *Known drift* below), so the
schedule cannot be paused from here. The switch can be.

To pause the schedule properly, in the provider's SQL editor:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;

SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE active;
-- and to resume
SELECT cron.alter_job(jobid, active := true)  FROM cron.job WHERE NOT active;
```

`alter_job` rather than `unschedule` keeps the definitions, so one statement
brings them back.

## Secrets

Edge functions read secrets from the Supabase project, never from `.env`:

| Secret | Used by |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | all |
| `LOVABLE_API_KEY` | 12 functions — the AI gateway behind ~14 call sites |
| `OPENAI_API_KEY` | `ai-discover`, `social-discover`, `discover-leads` |
| `FIRECRAWL_API_KEY` | `auto-discover`, `social-discover`, `discover-leads`, `enrich-lead` |
| `RESEND_API_KEY` | all four send paths |
| `RESEND_WEBHOOK_SECRET` | `resend-webhook` |
| `WHATSAPP_BUSINESS_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | `daily-outreach` |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `whatsapp-webhook` |
| `CRON_SECRET` | every cron-triggered function |

Set them with `supabase secrets set NAME=value`, or in the dashboard. **Never**
in this repo — the `no-secrets-in-diff` and gitleaks CI jobs enforce that.

## Authentication on functions

`config.toml` sets `verify_jwt = false` on all 18, so each function authenticates
itself. Two patterns:

- **Cron-or-JWT** (the autonomous ones): accepts `x-cron-secret` matching
  `CRON_SECRET`, otherwise requires a Bearer JWT and scopes all work to that
  user. Copy-pasted into about 10 functions.
- **JWT only** (the manual ones): `supabase.auth.getClaims(token)`, then every
  query filtered by the resulting `user_id`.

Webhooks verify provider signatures instead — Svix for Resend, HMAC-SHA256 for
Meta.

## Local checks

Edge functions are Deno, so `npm run lint` and `tsc` do not properly cover them.

```sh
npm run edge:check   # deno check every entrypoint
npm run edge:lint    # deno lint
npm run edge:fmt     # deno fmt (will reformat all 18 — do it deliberately)
```

[`functions/deno.json`](functions/deno.json) exists only so these commands and
CI can resolve the `npm:resend` and `npm:svix` imports. The Supabase edge
runtime resolves those itself and never reads the file.

## Migrations

23 files, applied in filename order. CI replays all of them against an empty
Postgres 15 on every push.

```sh
supabase db diff -f description_of_change   # generate from local changes
supabase db push                            # apply to the linked project
```

Rules:

1. **A new table gets `ENABLE ROW LEVEL SECURITY` and a policy in the same
   migration.** CI's `rls-policies` job fails the build otherwise.
2. **Never edit an already-applied migration.** Write a new one.
3. **Add indexes with the query that needs them.** There are currently **zero**
   indexes across all 23 migrations, so every hot query is a sequential scan.

### The schedule

Captured 13 September 2026 and recorded in
`20260913090000_pause_and_record_cron_schedule.sql`, which also pauses it:

| jobid | jobname | schedule (UTC) | runs/day |
| --- | --- | --- | --- |
| 9 | `auto-discover-every-6h` | `0 */6 * * *` | 4 |
| 10 | `auto-follow-up-every-2h` | `0 */2 * * *` | 12 |
| 11 | `daily-outreach-every-2h` | `0 8,10,12,14,16 * * *` | 5 |
| 12 | `daily-outreach-9am` | `0 6 * * *` | 1 |
| 13 | `process-sequences-every-2h` | `0 */2 * * *` | 12 |

34 invocations a day, **30 of which can send**. Jobs 10 and 13 share the same
expression, so they fire simultaneously — two senders drawing on one daily cap
while counting it differently.

`social-discover` has no job; it runs only when `auto-discover` chains to it.

Times are UTC and Kenya is UTC+3, so the every-2h jobs begin at 03:00 EAT —
outside the `active_hours` the Settings screen collects and no sender reads.

### Known drift

`get_cron_headers()` exists in the deployed database and in the generated
`types.ts`, but in no migration.

## Schema

15 tables. `leads` is the centre; most things hang off `lead_id` and every table
carries `user_id`.

```
teams ──< team_members >── profiles
                              │
settings (1 per user)         │
icp_profiles                  │
                              ▼
                           leads ──< email_campaigns >── ab_tests
                             │  ├──< conversations
                             │  ├──< meetings
                             │  └──< sequence_enrollments >── sequences
                             │                                sequence_templates
                           activity_logs
```

Two modelling notes: `email_campaigns` stores email, WhatsApp, Instagram DM and
LinkedIn messages (the name lies; `channel` was added later), and
`activity_logs` serves as audit trail, event bus and metrics store at once —
which is why the Dashboard reconstructs agent health by string-matching
`action` values.
