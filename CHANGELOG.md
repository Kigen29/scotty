# scotty

## 3.4.0

### Minor Changes

- 4440a13: Discovery finds real businesses on Google Maps that don't have a website.
  
  The rebuilt Discovery screen searches Google Places (Text Search, New) for a kind of business in an area, in
  Kenya: up to 60 results per search, 3 Google requests. It keeps operating businesses with no website or only a
  social page (Facebook, Instagram, WhatsApp links and similar). For those it asks Kenya's registry (KeNIC RDAP)
  whether a matching .co.ke or .ke domain is registered. Each lead gets a 0–100 prospect score: no site scores
  highest, then a phone number, active reviews and a match with your target categories and areas. Every lead comes
  from a real listing, with its Google rating, phone and map link. Nothing is generated.
  
  There's a monthly allowance (`PLACES_MONTHLY_LIMIT`, default 900) to stay inside Google's 1,000 free requests. Under
  Google's terms, discovered leads nobody acts on are cleared after 30 days, and the place id is kept for re-lookup.
  Leads can be qualified, dismissed or restored. The old 765-line discovery page and its dead AI pipeline buttons are
  gone. Lint debt drops from 122 to 102.

## 3.3.0

### Minor Changes

- 1e57ac2: Email replies come back into Scotty and get answered like enquiries.
  
  Scotty's emails now set their reply address to `reply+<lead id>@INBOUND_DOMAIN`. When someone replies, Resend
  receives it and posts `email.received` to `/api/inbound/email`. Scotty verifies the signature, fetches the
  message, keeps only what they wrote this time (quoted history, Outlook headers and signatures stripped), and files
  it on the right lead.
  
  Before any AI is involved:
  - Out-of-office notices, bounces and bulk mail are recorded and never answered, so two robots can't loop.
  - "STOP", "unsubscribe" and "remove me" mark the person don't-contact immediately.
  
  Then it runs the same pipeline as a website enquiry, except that Claude now sees the conversation so far: it
  answers in context, doesn't repeat the pitch, and holds anything risky for you. Inactive until
  `INBOUND_DOMAIN` and `RESEND_WEBHOOK_SECRET` are set.

## 3.2.0

### Minor Changes

- 804518e: Scotty replies to new enquiries on its own, and holds the risky ones for you.
  
  When an enquiry arrives, Claude now also says whether the owner should answer personally: complaints,
  discounts or custom pricing, contracts and payment terms, legal or refund questions, firm commitments,
  existing clients, and tests or unclear messages. Plain code in `api/_lib/autoreply.ts` then decides.
  
  - A genuine new enquiry gets the drafted reply straight away.
  - Anything flagged, plus existing clients, suppliers, job seekers and "other", is held, with the reason
    shown in Conversations and in the alert email ("Needs you: …").
  - Spam is ignored silently.
  - It never emails anyone `canReply()` refuses, and stops after two automatic replies to one person in a
    day, so two automated mailboxes can't loop.
  
  Settings → Automation has the kill switch: "Reply to enquiries automatically", on by default. Every step
  is written to the new `scotty.agent_events` table, which feeds the Agent activity screen in the redesign.
  Replies show who sent them: you, or Scotty ("Auto").
- a640c4c: A calmer interface, and the screens an automatic Scotty needs.
  
  The Lovable-era look is gone: no emoji greetings, no icons in coloured tiles, no drop shadows, no amber hover
  colour leaking into every menu and button. It's now Geist type, hairline borders, smaller corners and green only
  for status and actions. The theme is the same green, in light and dark.
  
  New screens:
  - **Home**: what needs you, the last 7 days (enquiries, auto-replies, holds, median time to reply), what Scotty
    did, and the pipeline.
  - **Inbox**: replaces Conversations. Threads are labelled *Needs you*, *Replied by Scotty* or *Waiting on them*.
    Held messages show the reason and open with Scotty's draft in the composer.
  - **Leads**: a searchable, filterable table with bulk stage changes, deletes and "Add lead".
  - **Lead page**: details, stage, notes that save on their own, a "Don't contact" switch, and one timeline of
    messages and agent decisions.
  - **Agent**: the automatic-reply switch, the rules in plain words, weekly counts and the full activity log.
  
  Campaigns, Sequences and Deliverability move under "Outreach · paused" with a note explaining why. Sign-in
  drops the sign-up option. The never-working team and notification code is removed: the lint debt goes from 147
  to 122 warnings.

### Patch Changes

- da33afa: Stop holding enquiries just because they ask how long a site takes or what it costs. Claude now answers
  those in the reply (timing depends on scope and gets confirmed on a call, and it never promises a date) and
  holds only demands for a guaranteed date or a written commitment.

## 3.1.0

### Minor Changes

- e3c40e2: Website enquiries arrive in Conversations, sorted by Claude, and replies are sent from Scotty.
  
  code5developers.com now posts each contact-form enquiry to `/api/inbound/website`, which is authenticated
  with a shared secret. Scotty finds or creates the lead (one per email address, so an outreach lead who fills
  in the form joins their thread) and records the message. Claude labels it by type and urgency, summarises it,
  and drafts a reply into the "AI Suggested Reply" panel, which never worked before. The studio gets an alert email.
  
  **Send Reply now tells the truth.** It used to save the reply as sent first and then call a send function,
  ignoring that function's failure, so "Reply sent" appeared when nothing went out. The server now sends first,
  records only what actually went, and shows the error otherwise.
  
  **Scotty only replies to people who wrote first.** Resend forbids cold outreach and Kenya's data protection
  law requires consent for marketing, so `send-reply` refuses any lead without an inbound message, as well as
  anyone unsubscribed.
  
  Conversations gains channel, subject, urgency, category, summary and a suggested subject, through the
  first migration in `db/migrations`, applied with `npm run db:migrate`. A "Sort with Claude" button re-runs
  triage when the first attempt failed. The date filter defaults to all time, so older threads aren't hidden.

## 3.0.0

### Major Changes

- 110738a: Move the backend off Lovable's managed Supabase onto Neon, served by Scotty's own Vercel functions.
  
  Lovable's database never applied merged migrations and gave no way to deploy, so fixes in this repository
  were not reaching production. The data was exported with Lovable's own export and loaded into the Neon
  database Code 5's website uses, under a `scotty` schema: 410 leads, 337 campaigns, 456 activity entries,
  settings, ICP profile and sequences, with every table's row count checked against the export.
  
  The screens are unchanged. `src/integrations/supabase/client.ts` keeps the slice of the supabase-js API
  they use and sends it to `/api/db`, where `api/_lib/query.ts` turns it into parameterised SQL. That module
  now does what row-level security did: only real tables and columns can be named, values are always bound,
  and every read and write is pinned to the operator, who also overrides any `user_id` the client sends.
  It carries the repository's first meaningful tests.
  
  Sign-in is a single operator with a password from the environment. Sign-ups are closed and realtime is
  gone; screens refresh when they load or act.
  
  **Every action that calls an edge function now reports that it is being rebuilt**: discovery, drafting,
  enrichment, verification, sending, the outreach agent and team management. They come back one at a time,
  behind a single send gate. Nothing sends email in the meantime.

### Patch Changes

- dcce512: Update dependencies and clear the high-severity audit findings.
  
  Consolidates five Dependabot pull requests (#55–#59): `@tanstack/react-query` 5.103.1, `typescript-eslint`
  8.70.1, `eslint-plugin-react-refresh` 0.5.7, `@changesets/cli` 3.0.3, `@types/node` 22.20.3 and
  `autoprefixer` 10.6.1. `npm audit fix` patches `source-map-js`, `postcss-selector-parser` and `minimatch`.
  
  Removes `zod` and `@hookform/resolvers`, which nothing imports. They were Lovable template leftovers, and
  `zod` 3 carried a high-severity advisory whose only fix is the 4.x major.
  
  `react-router` still carries two moderate advisories that need the 6 → 7 major. One concerns server-side
  rendering, which this single-page app doesn't do. That upgrade gets its own branch.

## 2.0.3

### Patch Changes

- 97d25cd: Fix the migration rehearsal against a plain Postgres, and make the verifier
  compare row counts against the source automatically.
  
  Supabase keeps `pgcrypto` in the `extensions` schema and puts that schema on the
  search path for every connection; a plain image does not, so any migration or
  column DEFAULT calling `gen_random_bytes` failed. The preflight now sets the
  search path at the database level, so the importer's own connection inherits it
  when a DEFAULT fires during INSERT.
  
  `migrate:verify` now carries the source row counts and reports ok / MISSING /
  MISMATCH per table, exiting non-zero on either. Comparing two printed tables by
  eye is exactly the step that gets skimmed at cutover — which is when it matters.

## 2.0.2

### Patch Changes

- 4311bc3: Export data as base64-encoded rows rather than one JSON blob per table.
  
  The inventory showed `leads` at 1.4 MB and `email_campaigns` at 632 kB — too
  large for a web SQL editor to hand back in a single result cell. Plain CSV of
  the real columns is worse, because the schema's five `jsonb` columns, five
  `text[]` arrays and newline-laden email bodies each give a delimiter or quote
  the chance to be misread, silently.
  
  One column, one row per record, base64. The alphabet has nothing a CSV writer
  could care about, so it survives any exporter at any size. Verified against
  embedded newlines, semicolons, quotes, unicode, nested objects, arrays and
  nulls before being relied on.

## 2.0.1

### Patch Changes

- 95b6bb0: Add Phase 1 migration tooling: export the data off the managed platform and
  prove it arrived intact.
  
  Lovable gives no Postgres connection string, so the SQL editor is the only route
  the data has out. The export is JSON rather than CSV because the schema has five
  `jsonb` columns, five `text[]` arrays and email bodies with embedded newlines —
  every one a chance for CSV to lose data silently while the row count still
  matches.
  
  Includes a local Postgres, a schema bootstrap that replays the 25 migrations
  with Supabase stubbed, an importer using `jsonb_populate_record` so Postgres
  does the type coercion, and a verifier that checks jsonb shape and array
  lengths rather than just counting rows.

## 2.0.0

### Major Changes

- f7d53e6: Add an autonomy kill switch to the five scheduled edge functions.
  
  `auto-discover`, `social-discover`, `daily-outreach`, `auto-follow-up` and
  `process-sequences` now exit immediately unless `AUTONOMY_ENABLED=true` is set
  in the project's edge function secrets. Absence of the secret means disabled, so
  the safe state is the default.
  
  The `pg_cron` schedule that drives these lives in the hosting provider's
  dashboard, not in this repository, so it cannot be paused from here. This makes
  it not matter: the jobs can keep firing and will do nothing.
  
  Manual functions are unaffected — discovery from the UI, drafting, sending a
  single campaign and both webhooks all still work.
  
  **Autonomous outreach stops when this deploys** until the secret is set.
- 684c483: Stop initiating WhatsApp, Instagram DM and LinkedIn messages.
  
  Email is now the only channel `daily-outreach` initiates on.
  
  WhatsApp is removed because Meta only permits free-form messages inside a
  24-hour window the *customer* opened. Business-initiated contact requires opt-in
  and a pre-approved template, so cold free-form sending is a policy violation
  that gets the number restricted — the error 133010 handling this code carried
  suggests it was already happening.
  
  Instagram DM and LinkedIn are removed because they never sent anything. They
  generated a draft with an LLM call and stopped; no code path has ever delivered
  one. That burned tokens and inflated the draft count with messages nobody could
  receive.
  
  Inbound WhatsApp is untouched — an owner messaging you still lands in
  Conversations, and that is the compliant way for a WhatsApp conversation to
  start. A lead reachable only by phone is now logged as needing a manual call
  rather than silently skipped.
- bfcd5c0: Pause the scheduled jobs and record the schedule in version control.
  
  The `pg_cron` schedule existed only in the hosting provider's dashboard: it
  could not be reviewed, reproduced, restored, or paused from this repository. It
  is now captured in a migration, which also switches every active job off.
  
  It was 34 invocations a day, 30 of them able to send. Two jobs shared the same
  expression and fired simultaneously, drawing on one daily cap while counting it
  differently.
  
  Uses `alter_job`, not `unschedule`, so the definitions survive and one statement
  brings them back.

### Patch Changes

- 5a1a3d9: Update lucide-react from 0.462.0 to 0.577.0.
  
  A 115-version jump across 54 distinct icons in 37 files. Icons get renamed and
  removed between lucide releases, and every one is a named import, so
  `tsc --noEmit` is a genuine check here rather than a formality — it passes, so
  no icon this app uses has been renamed or dropped.

## 1.0.3

### Patch Changes

- a38e951: Update autoprefixer and @tailwindcss/typography (dev dependencies).
- bd926bc: Update tailwindcss and @types/node (dev dependencies, patch level).
- cd281c2: Remove the unused sonner toaster.
  
  The app mounted two toast systems. Only one was ever used: every `toast()` call
  site imports `useToast` from `@/hooks/use-toast`, the Radix toaster. sonner's
  `<Toaster>` was rendered in `App.tsx` and its `toast()` was never called from
  anywhere, so it shipped in the bundle and displayed nothing.
  
  Removes the mount, the wrapper component and the dependency. Verified by driving
  the real sign-in form with bad credentials: the toast still appears, and no
  sonner element remains in the DOM.

## 1.0.2

### Patch Changes

- 3ebcd81: Update react-hook-form, react-day-picker, input-otp and lovable-tagger.
  
  All minors and patches, consolidated from four Dependabot pull requests into one
  verified change. App renders with no console errors.
- 12625dc: Fix the release workflow after the `changesets/action` v1 → v2 bump.
  
  v2 renamed its inputs — `version` → `version-script`, `title` → `pr-title`,
  `commit` → `commit-message` — and hard-errors on the old names. Because
  `release.yml` only runs on push to `main`, the action bump merged green and
  broke the release on the very next push.

## 1.0.1

### Patch Changes

- 311f149: Update dependencies: the tooling group, next-themes, tailwind-merge,
  @tanstack/react-query and sonner.
  
  Consolidated from four Dependabot pull requests into one branch so the whole set
  could be verified together, rather than merged one at a time with a rebase
  between each.
  
  All minors and patches. `next-themes` 0.3 → 0.4 and `eslint-plugin-react-refresh`
  0.4 → 0.5 are 0.x bumps, which can carry breaking changes, so theming was
  checked in a browser rather than assumed: the root class, `color-scheme` and the
  painted background all switch correctly between light and dark.
- bea62b1: Ignore all npm major updates in Dependabot.
  
  The previous rule covered only `vite`, `react`, `react-dom` and `tailwindcss`,
  so the first run proposed a single PR bumping `typescript` 5 → 7, `eslint`
  9 → 10, `vitest` 3 → 5, `eslint-plugin-react-hooks` 5 → 7 and
  `@vitejs/plugin-react-swc` 3 → 4 together. It failed Build, Lint, Test and
  Typecheck, and five simultaneous tool majors is not reviewable as one change.
  
  Majors now land deliberately, one package per branch, with the app exercised by
  hand. Patches and minors still arrive automatically.

## 1.0.0

### Major Changes

- 39297fb: Stop Scotty contacting businesses that were never real.
  
  Three functions asked a language model to produce businesses — names, plausible
  `+254` phone numbers, inferred email addresses — and inserted them as
  `status: 'qualified'`, where the sender picked them up highest-priority-first:
  
  - `ai-discover` generated leads outright. Deleted.
  - `discover-leads` fell back to generation whenever Firecrawl was unavailable or
    returned nothing. It now fails with a clear 422 instead.
  - `social-discover` generated whenever a platform search came back empty. It now
    skips the platform.
  
  A new `leads.verification_state` records provenance and every sender requires
  `verified`. Existing rows are backfilled: leads from real search results are
  `verified`; leads from the generative path are `rejected`; Instagram and TikTok
  leads are held as `unverified` because that function wrote generated and scraped
  leads under the same `discovery_source`, so they cannot be told apart after the
  fact.
  
  **This will reduce your contactable lead count, possibly sharply.** Those leads
  were not prospects; some of the phone numbers belong to real people who are not
  your prospects either.
  
  Also adds the first two indexes this schema has ever had, on the columns the
  senders actually filter by.

### Patch Changes

- 6886b3a: Fix the release workflow by moving CI to Node 24.
  
  `@changesets/cli`'s entrypoint calls `module.enableCompileCache()`, which landed
  in Node 22.1, so `changeset version` crashed with
  `TypeError: enableCompileCache is not a function` on the Node 20 runner — while
  every other CI job passed, because nothing else touches changesets.
  
  The Node major is now pinned in one place (the composite setup action) and
  mirrored in `.nvmrc`, so local and CI agree. That also closes the same class of
  bug that bit the Deno job earlier in this pipeline's life.
- 01479b2: Fix `auto-discover` calling `sanitizeForPrompt` without defining it.
  
  Every other function that uses the sanitiser declares its own copy;
  `auto-discover` did not. The resulting `ReferenceError` was thrown inside the
  `try` block that wraps lead analysis and swallowed by its `catch`, so on the
  Firecrawl discovery path every lead was written with no `analysis` and no
  `priority_score`. Since `daily-outreach` orders by `priority_score`, those leads
  sorted last and were effectively never contacted — silently, for as long as the
  path has existed.
  
  Found by adding `deno check` to CI, which reports it as
  `TS2304: Cannot find name 'sanitizeForPrompt'`.
- 195493b: Add CI pipelines, branch and commit conventions, changesets, and area READMEs.
  
  **CI** (`.github/workflows/ci.yml`) — lint, typecheck, test with coverage,
  production build, `deno check` over all 18 edge functions, and a replay of every
  migration against an empty Postgres 15. A single `CI OK` aggregate job is what
  branch protection should require.
  
  **PR hygiene** — enforces the `<type>/<description>` branch convention,
  conventional-commit PR titles, the presence of a changeset for behaviour
  changes, and blocks credential-shaped strings in the diff.
  
  **Security** — gitleaks over full history, `npm audit` gated on runtime
  dependencies, CodeQL, and a check that every `public` table enables RLS and has
  at least one policy.
  
  **Release** — changesets collects notes into a version PR that bumps the version,
  writes `CHANGELOG.md`, and tags. Nothing is published to npm.
  
  Also: a lint-debt ratchet (`.lintbudget`) so the 158 `no-explicit-any` warnings
  can shrink but never grow, a test-health reporter that surfaces the 0% coverage
  on every run, and READMEs for `src/`, `supabase/`, `.changeset/`, plus
  `CONTRIBUTING.md` and `docs/ci.md`.
  
  Three small fixes were needed to make the gates green: a `require()` converted
  to an ESM import in `tailwind.config.ts`, a handler misnamed `useSuggestedReply`
  (which tripped `react-hooks/rules-of-hooks`) renamed to `applySuggestedReply`,
  and a ternary used as a statement in `LeadDiscovery` turned into an `if`/`else`.
  `npm audit fix` also resolved a React Router open-redirect XSS in the runtime
  dependency tree.
- 04adbe4: Make CI pass on Dependabot pull requests.
  
  Two things broke every one of them:
  
  - The `branch-name` check held `dependabot/*` branches to our `<type>/<slug>`
    convention. Bots name their own branches, so those and `changeset-release/*`
    are now exempt.
  - Dependabot PRs cannot read repository secrets — GitHub scopes them to a
    separate store — so `CI_POSTGRES_PASSWORD` was empty and the `Migrations`
    job failed its fail-fast secret check. The secret now exists in both stores.
  
  Action updates are also grouped into one PR instead of one per action.
- bcda2a0: Fix the gitleaks allowlist so the secret scan passes on a full-history scan.
  
  The config used the `[[allowlists]]` array form, which requires gitleaks >= 8.21.
  `gitleaks-action@v2` pins an older build that ignores it silently, so the
  allowlist never applied and the scan failed on the public Supabase anon key.
  Switched to the singular `[allowlist]` table, which both parsers honour.
  
  This was invisible until now because on a pull request the action scans only
  that PR's commits — and none of them touched `.env`. The first full-history
  scan, on a push to main, is what surfaced it.
