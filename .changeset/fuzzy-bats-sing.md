---
"scotty": patch
---

Export data as base64-encoded rows rather than one JSON blob per table.

The inventory showed `leads` at 1.4 MB and `email_campaigns` at 632 kB — too
large for a web SQL editor to hand back in a single result cell. Plain CSV of
the real columns is worse, because the schema's five `jsonb` columns, five
`text[]` arrays and newline-laden email bodies each give a delimiter or quote
the chance to be misread, silently.

One column, one row per record, base64. The alphabet has nothing a CSV writer
could care about, so it survives any exporter at any size. Verified against
embedded newlines, semicolons, quotes, unicode, nested objects, arrays and
nulls before being relied on.
