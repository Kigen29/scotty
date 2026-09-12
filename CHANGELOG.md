# scotty

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
