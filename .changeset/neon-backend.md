---
"scotty": major
---

Move the backend off Lovable's managed Supabase onto Neon, served by Scotty's own Vercel functions.

Lovable's database never applied merged migrations and gave no way to deploy, so fixes in this repository
were not reaching production. The data was exported with Lovable's own export and loaded into the Neon
database Code 5's website uses, under a `scotty` schema: 410 leads, 337 campaigns, 456 activity entries,
settings, ICP profile and sequences, with every table's row count checked against the export.

The screens are unchanged. `src/integrations/supabase/client.ts` keeps the slice of the supabase-js API
they use and sends it to `/api/db`, where `api/_lib/query.ts` turns it into parameterised SQL. That module
now does what row-level security did: only real tables and columns can be named, values are always bound,
and every read and write is pinned to the operator, who also overrides any `user_id` the client sends.
It carries the repository's first meaningful tests.

Sign-in is a single operator with a password from the environment. Sign-ups are closed and realtime is
gone; screens refresh when they load or act.

**Every action that calls an edge function now reports that it is being rebuilt**: discovery, drafting,
enrichment, verification, sending, the outreach agent and team management. They come back one at a time,
behind a single send gate. Nothing sends email in the meantime.
