<!--
Title must be a conventional commit, e.g.
  fix(discovery): define sanitizeForPrompt in auto-discover
CI enforces this. See CONTRIBUTING.md.
-->

## What changed

<!-- One or two sentences. What does this do that the code did not do before? -->

## Why

<!-- The problem, not the solution. Link the issue if there is one. -->

Closes #

## How it was verified

<!-- Delete what does not apply. "CI passed" alone is not verification when the
     suite covers 0% of the app. -->

- [ ] `npm run verify` passes locally (lint, typecheck, test, build)
- [ ] `npm run edge:check` passes (if edge functions changed)
- [ ] Ran the app and exercised the change by hand
- [ ] Added or updated tests
- [ ] Migration applied to a scratch database, not just the hosted one

## Outbound safety

<!-- REQUIRED if this touches discovery, composing, sending, or the schema.
     Scotty emails real businesses; a mistake here is not recoverable. -->

- [ ] Does not let an unverified or fabricated contact reach a send path
- [ ] Respects `unsubscribed` / suppression
- [ ] Respects the daily send cap
- [ ] Cannot send from a cron path without passing the same guards as `send-email`
- [ ] N/A — this PR touches none of the above

## Changeset

- [ ] Added (`npm run changeset`)
- [ ] Not needed — ships no behaviour change, and the `no-changeset` label is applied

## Notes for the reviewer

<!-- Anything deliberately left out, a follow-up you plan, a risk you accepted. -->
