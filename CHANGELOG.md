# scotty

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
