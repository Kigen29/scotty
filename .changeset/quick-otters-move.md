---
"scotty": patch
---

Add Phase 1 migration tooling: export the data off the managed platform and
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
