---
"scotty": major
---

Add an autonomy kill switch to the five scheduled edge functions.

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
