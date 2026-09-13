---
"scotty": patch
---

Fix the migration rehearsal against a plain Postgres, and make the verifier
compare row counts against the source automatically.

Supabase keeps `pgcrypto` in the `extensions` schema and puts that schema on the
search path for every connection; a plain image does not, so any migration or
column DEFAULT calling `gen_random_bytes` failed. The preflight now sets the
search path at the database level, so the importer's own connection inherits it
when a DEFAULT fires during INSERT.

`migrate:verify` now carries the source row counts and reports ok / MISSING /
MISMATCH per table, exiting non-zero on either. Comparing two printed tables by
eye is exactly the step that gets skimmed at cutover — which is when it matters.
