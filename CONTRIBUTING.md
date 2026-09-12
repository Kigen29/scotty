# Contributing to Scotty

Scotty sends real email to real businesses on a schedule, with no human in the
loop for parts of the flow. That single fact sets the tone for everything here:
the process exists to stop a bad change reaching strangers' inboxes, not to
generate paperwork.

- [Branches](#branches)
- [Commits and PR titles](#commits-and-pr-titles)
- [Changesets](#changesets)
- [Running the checks locally](#running-the-checks-locally)
- [What CI enforces](#what-ci-enforces)
- [Working on edge functions](#working-on-edge-functions)
- [Working on migrations](#working-on-migrations)
- [The lint budget](#the-lint-budget)
- [Tests](#tests)

## Branches

**Never commit to `main`.** Every change — a feature, a one-character typo fix, a
README edit — goes on a branch and through a pull request. CI validates the
branch name, so a wrong prefix fails before review.

```
<type>/<short-kebab-description>
```

| Prefix | For | Example |
| --- | --- | --- |
| `feat/` | New capability | `feat/inbound-email-ingest` |
| `fix/` | Bug fix | `fix/auto-discover-sanitizer` |
| `docs/` | Documentation only | `docs/contributing-guide` |
| `chore/` | Deps, config, renames, housekeeping | `chore/rebrand-to-scotty` |
| `refactor/` | Restructuring, no behaviour change | `refactor/shared-send-gate` |
| `test/` | Tests only | `test/send-policy-units` |
| `ci/` | Pipelines and tooling | `ci/github-actions` |
| `perf/` | Performance | `perf/lead-query-indexes` |
| `security/` | Hardening | `security/suppression-table` |
| `revert/` | Reverting a change | `revert/ai-discover-removal` |

Keep the description short and specific: `fix/sanitizer` is too vague,
`fix/auto-discover-missing-sanitizeforprompt-reference-error` is too long.

```sh
git switch main && git pull
git switch -c fix/lead-dedupe-race
```

One logical change per branch. If you find a second thing while in there, note
it and open a separate branch — a PR that does two things gets reviewed as
neither.

## Commits and PR titles

The **PR title** must be a [conventional commit](https://www.conventionalcommits.org/)
because it becomes the squash-merge commit message and feeds the changelog:

```
<type>(<optional scope>): <subject>

feat(discovery): add OpenStreetMap Overpass as a lead source
fix(outreach): respect active_hours before sending
docs(readme): drop Lovable boilerplate
refactor(functions): extract shared send gate
```

Rules CI checks: a valid type, a subject under 100 characters, no trailing
period. Use `!` after the type for a breaking change — `feat(db)!: drop
leads.priority_score`.

Individual commits on the branch can be messy; the squash message is what
survives.

## Changesets

A changeset is a short note describing what shipped. For Scotty these are
**release notes**, not package publishing — the changelog is the first thing you
read when the agent has done something unexpected overnight.

```sh
npm run changeset
```

Pick the bump, write a summary, commit the generated file in `.changeset/`.

CI requires a changeset when a PR touches `src/`, `supabase/`, or
`package.json`. If your change genuinely ships nothing, add the
**`no-changeset`** label to the PR instead.

See [.changeset/README.md](.changeset/README.md) for how to choose the bump
level. Short version: when in doubt on anything touching sending, discovery, or
the schema, go one level higher.

## Running the checks locally

Run everything CI will run:

```sh
npm run verify        # lint + typecheck + test + build
```

Or piecemeal:

```sh
npm run lint          # eslint — errors fail CI
npm run lint:fix      # autofix what it can
npm run lint:budget   # warnings may not increase
npm run typecheck     # tsc --noEmit
npm test              # vitest
npm run test:coverage # vitest + coverage report
npm run test:health   # how much the suite actually proves
npm run build         # production build
npm run edge:check    # deno type-check all 18 edge functions (needs deno)
npm run edge:lint     # deno lint
```

`npm run verify` does not cover edge functions or migrations — run
`npm run edge:check` yourself if you touched `supabase/functions/`.

## What CI enforces

Five workflows. Full detail in [docs/ci.md](docs/ci.md).

| Workflow | Runs on | Blocks a merge? |
| --- | --- | --- |
| **CI** | every push, every PR | Yes — lint, typecheck, test, build, edge functions, migrations |
| **PR hygiene** | PRs to `main` | Yes — branch name, PR title, changeset, secrets in diff |
| **Security** | pushes to `main`, PRs, weekly | Yes — gitleaks, runtime `npm audit`, RLS coverage |
| **Release** | merges to `main` | No — opens the version PR |
| **Dependabot** | Mondays | No — opens grouped update PRs |

Point branch protection at the single **`CI OK`** check. It aggregates the other
CI jobs, so adding a job later does not mean reconfiguring the ruleset.

## Working on edge functions

They run on Deno, not Node, so `npm run lint` and `tsc` will not catch
everything — a missing import or an undefined name slips straight through. CI's
`edge-functions` job runs `deno check` on all 18 entrypoints, which is exactly
what caught `auto-discover` calling a `sanitizeForPrompt` it never defined.

Install Deno and check your work before pushing:

```sh
npm run edge:check
```

[`supabase/functions/deno.json`](supabase/functions/deno.json) exists purely so
local and CI checking can resolve the `npm:` imports. The Supabase runtime does
not read it, so nothing there changes deployed behaviour.

`deno fmt --check` is advisory for now — 18 of 19 files are unformatted, and
reformatting them all in one commit would bury real work in whitespace.

## Working on migrations

CI applies every migration in filename order to an empty Postgres 15, so a
migration that depends on something a later file creates will fail.

Two rules that CI cannot check for you:

1. **A new table gets RLS in the same migration.** The `rls-policies` job fails
   the build if any `public` table lacks `ENABLE ROW LEVEL SECURITY` or has no
   policy. This is the only thing separating one user's leads from another's.
2. **Never edit a migration that has been applied to the hosted project.** Write
   a new one. The repo and the live database have already drifted once — the
   `pg_cron` schedule and `get_cron_headers` exist in production and in no
   migration file.

## The lint budget

The repo carries 159 `no-explicit-any` warnings from its hand-rolled data
fetching. Erroring on all of them would block every PR; ignoring them lets the
pile grow. So the count is recorded in `.lintbudget` and CI fails if it rises.

Fix some and CI will tell you to lower the budget:

```sh
npm run lint:budget -- --write   # commit the new number with your change
```

Errors are never budgeted. Those you just fix.

## Tests

Be aware of what the suite currently proves: **nothing.** One placeholder test,
0% line coverage across 6,382 lines, no tests on any of the 18 edge functions.
A green CI run is not evidence your change works — exercise it by hand and say
how in the PR.

`npm run test:health` prints the gap, and CI posts it to the run summary every
time.

When adding tests, start where a mistake costs the most:

1. The send gate — suppression, verification, quiet hours, daily cap
2. The ICP scorer
3. The prompt sanitiser
4. Webhook handlers, against captured Resend and WhatsApp payloads
5. RLS — assert one user cannot read another's leads

Coverage thresholds are deliberately off. They get switched on in the same PR
that lands the first real tests, rather than sitting at zero and training
everyone to ignore a red gate.
