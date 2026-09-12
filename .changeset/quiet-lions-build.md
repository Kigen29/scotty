---
"scotty": patch
---

Add CI pipelines, branch and commit conventions, changesets, and area READMEs.

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
