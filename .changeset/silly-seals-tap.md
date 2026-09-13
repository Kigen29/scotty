---
"scotty": major
---

Pause the scheduled jobs and record the schedule in version control.

The `pg_cron` schedule existed only in the hosting provider's dashboard: it
could not be reviewed, reproduced, restored, or paused from this repository. It
is now captured in a migration, which also switches every active job off.

It was 34 invocations a day, 30 of them able to send. Two jobs shared the same
expression and fired simultaneously, drawing on one daily cap while counting it
differently.

Uses `alter_job`, not `unschedule`, so the definitions survive and one statement
brings them back.
