# Migration tooling — Phase 1

Getting Scotty's data off the Lovable-managed database and proving it arrived
intact, before anything depends on that being true.

## Why this exists, and why it is the risky step

Lovable will not give us a Postgres connection string. There is no
`supabase link`, no `pg_dump`, no service-role key. **The SQL editor is the
only route the data has out**, and it has no fallback if the provider changes
something.

So this is not a chore to rush at cutover. It is a rehearsal, run twice: once
now to prove the route works and establish the numbers, once again at cutover
for real.

## Why base64, of all things

The obvious approach — one `jsonb_agg` per table, copied out of the result cell
— does not survive contact with this data. `leads` is **1.4 MB** and
`email_campaigns` **632 kB**, and a web SQL editor will not hand you a single
cell that size intact.

The next obvious approach, plain CSV of the real columns, is worse. The schema
has:

| Hazard | Where |
| --- | --- |
| `jsonb` | `leads.analysis`, `social_links`, `contact_channels`, `settings.portfolio_projects`, `sequences.steps` |
| `text[]` | `settings.services`, `target_categories`, `target_locations`, `portfolio_links`, `follow_up_intervals` |
| Newlines, commas, semicolons | `email_campaigns.body`, `conversations.message` |

Each is a chance for a delimiter or quote to be misread, and **the failure is
silent**: the row count still matches and a field is subtly wrong. You would
find out months later when the agent behaved strangely.

So the export is **one column, one row per record, base64**. The alphabet is
`[A-Za-z0-9+/=]` — no delimiter, no quote, no newline, no unicode. It survives
any exporter, at any size, without needing to trust its quoting. On the way
back in, `jsonb_populate_record` lets Postgres coerce each column from its own
definition, so there is no per-column mapping in a script to drift.

This was tested against deliberately hostile input before being relied on —
embedded newlines, semicolons, double quotes, em dashes, Chinese characters,
nested objects, arrays, nulls, quoted and unquoted lines, CRLF endings. All
round-tripped exactly.

## Running it

**1. Inventory — tells us what we are dealing with**

Run [`01-inventory.sql`](01-inventory.sql) in the Lovable SQL editor. Row
counts and sizes per table. If a table is too large to export in one query,
this is where we find out rather than halfway through.

**2. Export**

Run each block in [`02-export.sql`](02-export.sql). Each returns one row per
record, one column, base64.

**Use the editor's CSV export button** — the same one you used for the cron
list — and save each as `data/<table>.csv`.

Run the counts query at the bottom of that file too, and keep the output. It is
what `migrate:verify` compares against, and it is the only defence against an
export that truncated and still looks plausible.

**3. Restore locally and verify**

```sh
npm run migrate:up        # Postgres 16 on 127.0.0.1:54329
npm run migrate:schema    # applies the 25 migrations, with Supabase stubbed
npm run migrate:import    # loads data/*.json
npm run migrate:verify    # prints a fingerprint, and the query to compare it against
```

`migrate:verify` prints the same query to run on the **source**. Compare the two
outputs line by line. They must match exactly.

It checks more than row counts, because a row count matching proves very little:

- `jsonb` columns are still objects, not strings that look like objects
- `text[]` arrays still have their elements
- the longest email body survived — that is where embedded newlines would show

Requires Docker. On Windows, start Docker Desktop first.

## Safety

Both scripts refuse to run against anything but a loopback address, because
they truncate tables. They cannot be pointed at production by accident.

`data/` is gitignored. Real lead data — including 319 rows a model invented and
184 addresses that may belong to real people — never enters the repository.

## What is deliberately not migrated

| | |
| --- | --- |
| `teams`, `team_members` | The feature is being dropped. Scoping becomes per-user. |
| `auth.users` | One operator. That is a new password, not a migration. |
| `pg_cron` schedule | Replaced by queue repeatable jobs defined in code. |

## What this is not

A rehearsal schema, not the final one. Phase 2 replaces these 25 migrations
with a Drizzle schema that owes nothing to Supabase — no `auth` schema, no RLS,
no `pg_cron`. This exists only so the export has somewhere faithful to land and
be counted.
