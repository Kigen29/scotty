-- STEP 2 of the migration: get the data out.
--
-- One row per line, each a base64-encoded JSON object.
--
-- WHY THIS SHAPE
--
-- The obvious approach, one jsonb_agg per table copied out of the result cell,
-- breaks down here: leads is 1.4 MB and email_campaigns 632 kB, and a web SQL
-- editor will not hand you a single cell that size intact.
--
-- The next obvious approach, plain CSV of the real columns, is worse. This
-- schema has five jsonb columns, five text[] arrays, and email bodies full of
-- newlines and commas. Every one is a chance for a delimiter or quote to be
-- misread, and the failure is silent: the row count still matches and a field
-- is subtly wrong.
--
-- So: one column, and an alphabet with nothing a CSV writer could care about.
-- Base64 is [A-Za-z0-9+/=] — no delimiter, no quote, no newline, no unicode.
-- It survives any exporter, at any size, without needing to trust its quoting.
-- The replace() strips the line breaks Postgres inserts every 76 characters,
-- which would otherwise split one record across several CSV lines.
--
-- HOW TO RUN
--   Run one block. Use the editor's CSV export button — the same one you used
--   for the cron list. Save it as tools/migration/data/<table>.csv.
--   Repeat for each block. Order does not matter; the importer sorts it out.
--
-- teams and team_members are deliberately absent. They are being dropped.

-- ── profiles ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.profiles t
ORDER  BY t.id;

-- ── settings ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.settings t
ORDER  BY t.id;

-- ── icp_profiles ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.icp_profiles t
ORDER  BY t.id;

-- ── leads ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.leads t
ORDER  BY t.id;

-- ── sequences ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.sequences t
ORDER  BY t.id;

-- ── sequence_templates ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.sequence_templates t
ORDER  BY t.id;

-- ── ab_tests ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.ab_tests t
ORDER  BY t.id;

-- ── email_campaigns ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.email_campaigns t
ORDER  BY t.id;

-- ── conversations ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.conversations t
ORDER  BY t.id;

-- ── meetings ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.meetings t
ORDER  BY t.id;

-- ── sequence_enrollments ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.sequence_enrollments t
ORDER  BY t.id;

-- ── activity_logs ──
SELECT replace(encode(convert_to(to_jsonb(t)::text, 'UTF8'), 'base64'), chr(10), '') AS row_b64
FROM   public.activity_logs t
ORDER  BY t.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- COUNTS — run this too, and keep the output. It is what `migrate:verify`
-- compares the restored copy against, and it is the only defence against a
-- truncated export that otherwise looks fine.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'profiles' AS t, count(*) FROM public.profiles
UNION ALL SELECT 'settings',             count(*) FROM public.settings
UNION ALL SELECT 'icp_profiles',         count(*) FROM public.icp_profiles
UNION ALL SELECT 'leads',                count(*) FROM public.leads
UNION ALL SELECT 'sequences',            count(*) FROM public.sequences
UNION ALL SELECT 'sequence_templates',   count(*) FROM public.sequence_templates
UNION ALL SELECT 'ab_tests',             count(*) FROM public.ab_tests
UNION ALL SELECT 'email_campaigns',      count(*) FROM public.email_campaigns
UNION ALL SELECT 'conversations',        count(*) FROM public.conversations
UNION ALL SELECT 'meetings',             count(*) FROM public.meetings
UNION ALL SELECT 'sequence_enrollments', count(*) FROM public.sequence_enrollments
UNION ALL SELECT 'activity_logs',        count(*) FROM public.activity_logs
ORDER BY 1;
