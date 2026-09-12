# CI reference

Five workflows in [`.github/workflows/`](../.github/workflows/). This document
says what each job does, why it exists, and what to do when it goes red.

For the contribution rules themselves — branch names, changesets, commit format
— see [CONTRIBUTING.md](../CONTRIBUTING.md).

## At a glance

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | every push; PRs to `main` | `lint`, `typecheck`, `test`, `build`, `edge-functions`, `migrations`, `ci-ok` |
| [`pr-hygiene.yml`](../.github/workflows/pr-hygiene.yml) | PRs to `main` | `branch-name`, `pr-title`, `changeset`, `no-secrets-in-diff` |
| [`security.yml`](../.github/workflows/security.yml) | pushes to `main`; PRs; Mondays 06:00 UTC | `secret-scan`, `audit`, `codeql`, `rls-policies` |
| [`release.yml`](../.github/workflows/release.yml) | merges to `main` | `version`, `pending` |
| [`dependabot.yml`](../.github/dependabot.yml) | Mondays 06:00 EAT | grouped dependency PRs |

Every job installs via the shared composite action at
[`.github/actions/setup`](../.github/actions/setup/action.yml) — Node 24 plus
`npm ci`, with the npm download cache keyed on `package-lock.json`.
`node_modules` itself is deliberately not cached; that breaks whenever a native
dependency or the Node version changes.

The Node major is pinned in one place — the composite action's default — and
mirrored in `.nvmrc` so local and CI agree. It must stay at 22 or above:
`@changesets/cli` calls `module.enableCompileCache()`, which does not exist
before Node 22.1, so the release workflow fails on Node 20 while every other
job passes.

## CI

### `lint`

```sh
npm run lint          # eslint — errors fail
npm run lint:budget   # warnings may not increase
```

ESLint is configured in four blocks, because the repo holds four kinds of code:

- **`src/**`** — browser globals, React hooks rules
- **`supabase/functions/**`** — Deno globals, not browser
- **root configs** — Node globals, `require()` allowed
- **ignored** — `dist`, `coverage`, vendored `src/components/ui/**`, and the
  generated `types.ts` and `previewAuthStorage.ts`

**Red because warnings went up?** Fix them, or justify raising `.lintbudget` in
the PR description. **Red because they went down?** Run
`npm run lint:budget -- --write` and commit the new number — that is the ratchet
working as intended.

### `typecheck`

`tsc --noEmit -p tsconfig.app.json`. Note this config has `strict: false` and
`noImplicitAny: false`, so it catches much less than it looks like it does.
Tightening it is a Phase 4 item.

### `test`

Runs `vitest run --coverage`, then `npm run test:health`, then uploads the
coverage report as an artifact for 14 days.

`test` blocks a merge. **`test:health` does not** — it prints a table to the run
summary showing test-to-source ratio, edge-function test count, and line,
branch and function coverage, plus any structural gaps it finds. Today it
reports 0% coverage and 18 untested edge functions. That is accurate, and the
point of showing it on every run is that the number stays in front of you.

There are no coverage thresholds yet. A threshold at zero teaches everyone to
ignore the gate; they get switched on with the first real tests.

### `build`

`npm run build`, then a bundle-size table in the run summary, then the `dist/`
artifact for 7 days. The main chunk is currently ~1.3 MB (372 kB gzipped) and
Vite warns about it — code splitting is a Phase 4 item, not a build failure.

### `edge-functions`

The one job that catches a class of bug nothing else can. The 18 functions run
on Deno; `npm run lint` and `tsc` never look at them properly, so an undefined
identifier ships silently.

```sh
deno lint                                # blocking
deno check --allow-import <each fn>      # blocking
deno fmt --check                         # advisory
```

This is what caught `auto-discover` calling `sanitizeForPrompt` without ever
defining it — a `ReferenceError` that the function's own `catch` swallowed, so
lead analysis had been failing silently on the Firecrawl path.

Runs from `supabase/functions/` so that
[`deno.json`](../supabase/functions/deno.json) resolves the `npm:resend` and
`npm:svix` imports. Without it you get a package-not-found error that looks like
a code bug and is not one.

### `migrations`

**The database password comes from an Actions secret**,
`CI_POSTGRES_PASSWORD`, and appears nowhere in the repo. Two simpler things were
tried first and both failed:

| Attempt | Outcome |
| --- | --- |
| literal `postgres` | Correctly flagged by GitGuardian as a hardcoded password |
| `POSTGRES_PASSWORD: ${{ github.run_id }}` | Still flagged — the detector matches the password-shaped assignment, not just the literal |
| `POSTGRES_HOST_AUTH_METHOD: trust` | Ignored: `supabase/postgres` ships its own `pg_hba.conf` requiring a password, so psql fails with *password authentication failed* |

The value is throwaway — the database is created fresh inside the runner,
listens only on localhost, and dies with the job. Actions encrypts it at rest
and masks it in logs. Rotate with `gh secret set CI_POSTGRES_PASSWORD`; any
random value works. A `Check the CI database secret is set` step fails fast with
that instruction if it is missing, rather than emitting twenty confusing
authentication errors.

Spins up Postgres, stubs the bits of Supabase the bare image lacks (the
`auth` schema, `auth.uid()`, `auth.users`, `pgcrypto`), then applies every
migration in `supabase/migrations/` in filename order with `ON_ERROR_STOP=1`.

Catches ordering mistakes — a migration referencing a table or function that a
later file creates. On success it prints the resulting table list to the summary.

This is **not** a test against the live schema. The hosted project has already
drifted from the repo: `get_cron_headers` and the entire `pg_cron` schedule
exist in production and in no migration. Bringing those into version control is
Phase 1.

### `ci-ok`

An aggregator. It fails if any of the six jobs above did not succeed.

**Point branch protection at `CI OK` and nothing else** — then adding or renaming
a job never means editing the ruleset.

## PR hygiene

### `branch-name`

Validates `github.head_ref` against the prefix list. The error message includes
the rename commands.

Branches beginning `dependabot/` or `changeset-release/` are exempt — bots name
their own branches, and holding them to our convention only produces a red check
nobody can fix.

### `pr-title`

Conventional commit format, subject under 100 characters, no trailing period.
The title becomes the squash commit message, which is why it matters more than
the individual commits.

### `changeset`

Requires a file in `.changeset/` when the diff touches `src/`, `supabase/`, or
`package.json`. Override with the **`no-changeset`** label.

### `no-secrets-in-diff`

Greps **added lines only** for credential-shaped strings: Resend (`re_`),
Firecrawl (`fc-`), OpenAI (`sk-`), Meta tokens (`EAA`), PEM private keys, and
any secret-looking name assigned an inline literal instead of read from the
environment.

Every pattern is passed to `grep` after `--`. Without it the private-key
pattern, which begins with a dash, is parsed as a flag: grep errors and the
check silently passes. A check that never runs is worse than one that fails, so
all seven patterns are exercised against planted secrets as a positive control.

Deliberately no bare `service_role` check — all 11 discovery and sending
functions legitimately call `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`, so that
pattern would fail on every PR that touched them. What matters is a key being
*assigned*, not a variable being *named*.

Full history is covered by gitleaks in the security workflow.

## Security

### `secret-scan`

gitleaks over the full history, not just the diff.

> The allowlist uses the **singular `[allowlist]`** table, not `[[allowlists]]`.
> The plural array form requires gitleaks >= 8.21, and `gitleaks-action@v2`
> pins an older build on which it is silently ignored — the allowlist never
> applies and the scan fails on the anon key. Local development uses a newer
> gitleaks, which honours both, so this only shows up in CI. Keep the config
> compatible with the older parser.
>
> Note also that on a **pull request** the action scans only that PR's commits,
> so a config problem here can stay invisible until a push or scheduled run
> does a full-history scan.

Configured by
[`.gitleaks.toml`](../.gitleaks.toml): all default rules, plus an allowlist for
exactly one value — the Supabase anon key in `.env`.

That key is a JWT, so the default `jwt` rule matches it, but its payload is
`{"role":"anon"}`: it is public by design and Vite inlines it into the bundle
anyway. The allowlist is the **literal key**, not a path rule for `.env`, so a
`service_role` key, a Resend key or a private key added to that same file is
still caught. If the anon key is rotated, update the regex in the same commit.

### `audit`

```sh
npm audit --omit=dev --audit-level=high    # blocking
npm audit                                  # advisory, reported in the summary
```

The blocking gate covers **runtime** dependencies — code that reaches a user's
browser. Build tooling is reported but does not block, because the one
outstanding high is Vite 5's dev-server path traversal (plus a `launch-editor`
NTLM hash disclosure that only affects Windows), and the fix is a major bump to
Vite 8. The dev server never runs in production.

> **Follow-up:** upgrade Vite 5 → 8 deliberately, with the app exercised by
> hand. Dependabot is configured to *not* raise it automatically.

### `codeql`

GitHub's `security-and-quality` query pack over the TypeScript.

**Off by default.** Code scanning is free on public repositories but requires
GitHub Advanced Security on private ones, and this repo is private — so the job
fails with *"Code scanning is not enabled for this repository"* regardless of
how it is configured. It is gated behind a repo variable rather than deleted:

```sh
gh variable set ENABLE_CODEQL --body true
```

Turn it on if the repo goes public or GHAS is purchased. Until then lint,
typecheck, gitleaks and the RLS-coverage check carry this ground.

### `rls-policies`

Parses the migrations and asserts every `public` table both enables row-level
security and is named by at least one policy. Currently all 14 pass.

This is the highest-value check in the repo. RLS is the only thing stopping one
user reading another's leads, and the policies have already been dropped and
recreated four separate times across the migration history.

What it cannot check: whether a policy is *correct*. Every policy today is
`auth.uid() = user_id`, which means teammates cannot see each other's leads even
though `leads.assigned_to`, `team_members` and `has_team_role()` all exist. That
is a design gap, not a syntax one.

## Release

`changesets/action` collects pending changesets into a **"chore(release): version
packages"** PR. Merging it bumps the version in `package.json`, rewrites
`CHANGELOG.md`, and tags.

Nothing is published to npm — Scotty is a private application, and
`.changeset/config.json` sets `privatePackages: { version: true, tag: true }` to
get versioning and changelogs without publishing.

The `pending` job prints queued changesets to the run summary, so one glance
tells you whether anything is waiting to ship.

## Dependabot

Mondays 06:00 Africa/Nairobi, max 5 open PRs, grouped so ~30 Radix packages
arrive as one PR rather than thirty. Groups: `radix`, `react`, `tooling`,
`supabase`. Labelled `dependencies` and `no-changeset`.

**All npm majors are ignored on purpose.** Dependabot handles patches and
minors; majors land deliberately, on a branch named for the package, with the
app exercised by hand.

The narrower rule this replaces covered only `vite`, `react`, `react-dom` and
`tailwindcss` — so the first run proposed one PR bumping `typescript` 5 → 7,
`eslint` 9 → 10, `vitest` 3 → 5, `eslint-plugin-react-hooks` 5 → 7 and
`@vitejs/plugin-react-swc` 3 → 4 together. It failed Build, Lint, Test and
Typecheck, and five simultaneous tool majors is not reviewable as one change.

To take a major:

```sh
git switch -c chore/typescript-7
npm i typescript@latest
npm run verify          # and exercise the app
```

Action majors are *not* ignored — they are grouped into a single PR, and
`gitleaks-action` in particular needs a full-history scan after any bump, since
a PR-scoped scan cannot prove the allowlist still parses.

Action updates are grouped into a single PR. The first Dependabot run opened
five separate PRs for five action majors; one grouped PR is one review.

**Dependabot PRs cannot read repository secrets.** GitHub scopes them to a
separate Dependabot secret store, so `CI_POSTGRES_PASSWORD` has to exist in
both:

```sh
gh secret set CI_POSTGRES_PASSWORD                  # normal runs
gh secret set CI_POSTGRES_PASSWORD --app dependabot # Dependabot PRs
```

Without the second, every Dependabot PR fails the `Migrations` job on the
fail-fast secret check — which is the check doing its job, but the cause is not
obvious from the message alone.

## Things CI does not do yet

Honest gaps, roughly in the order they are worth closing:

- **No deployment.** Edge functions and migrations are still pushed by hand or
  by Lovable. A `supabase functions deploy` job gated on `main` is the obvious
  next step, and needs a `SUPABASE_ACCESS_TOKEN` secret.
- **No schedule verification.** The `pg_cron` jobs that drive the whole
  autonomous system live only in the Supabase dashboard. CI cannot check what it
  cannot see.
- **No end-to-end test.** Nothing exercises discover → score → compose → send
  against a scratch database with the network stubbed.
- **No preview environments.** A PR cannot be clicked through before merge.
- **No bundle-size gate.** The size is reported, not enforced.
- **`deno fmt` is advisory.** Turn it blocking once the functions have been
  reformatted in a dedicated commit.
- **`security.yml` cannot be dry-run before it reaches `main`.**
  `workflow_dispatch` only offers workflows that exist on the default branch, so
  the first real run of gitleaks and CodeQL happens on merge. `npm audit` and
  the RLS-coverage check were both verified locally beforehand.
- **`pr-hygiene.yml` only runs on PRs whose base is `main`.** In a stacked PR
  chain the upper PRs skip it until they are retargeted.
