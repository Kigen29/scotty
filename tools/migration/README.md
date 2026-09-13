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

## Why JSON and not CSV

CSV through a web SQL editor is where this migration would quietly lose data.
The schema has:

| Hazard | Where |
| --- | --- |
| `jsonb` columns | `leads.analysis`, `leads.social_links`, `leads.contact_channels`, `settings.portfolio_projects`, `sequences.steps` |
| `text[]` arrays | `settings.services`, `target_categories`, `target_locations`, `portfolio_links`, `follow_up_intervals` |
| Embedded newlines and commas | `email_campaigns.body`, `conversations.message` |

Every one is a chance for a delimiter or a quote to be misread, and the failure
mode is **silent**: the row count matches and a field is subtly wrong. You find
out months later when the agent behaves oddly.

`jsonb_agg` removes the class of problem. Postgres serialises, Postgres parses
it back. Nested objects, arrays, newlines, unicode and NULLs all survive
exactly, and `jsonb_populate_record` on the way in means Postgres does the type
coercion rather than a script guessing at it.

## Running it

**1. Inventory — tells us what we are dealing with**

Run [`01-inventory.sql`](01-inventory.sql) in the Lovable SQL editor. Row
counts and sizes per table. If a table is too large to export in one query,
this is where we find out rather than halfway through.

**2. Export**

Run each block in [`02-export.sql`](02-export.sql). Each returns a single value:
a JSON array of that table's rows. Copy the whole cell — including the
surrounding `[` `]` — into `data/<table>.json`.

Do **not** use the editor's CSV export button for these. Copy the cell.

Too large for one query? Use the paginated form at the bottom of that file and
save `leads.part1.json`, `leads.part2.json`, and so on. The importer
concatenates any file matching `<table>*.json`, so parts need no merging.

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
