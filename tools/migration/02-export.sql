-- STEP 2 of the migration: get the data out.
--
-- JSON, not CSV. CSV through a web SQL editor is where this migration would
-- quietly lose data: Scotty's schema has five jsonb columns (analysis,
-- social_links, contact_channels, portfolio_projects, steps), three text[]
-- columns in settings, and email bodies with embedded newlines and commas.
-- Every one of those is a chance for a delimiter or a quote to be misread,
-- and the failure is silent — you get a row count that matches and a field
-- that is subtly wrong.
--
-- jsonb_agg sidesteps all of it. Postgres serialises, Postgres parses it back.
-- Nested objects, arrays, newlines, unicode and NULLs all survive exactly.
--
-- HOW TO RUN
--   Run one block at a time. Copy the single result value — the whole JSON
--   array — into tools/migration/data/<table>.json in this repo.
--   Do not use the editor's CSV export for these; copy the cell contents.
--
-- If a table is too large for the editor to return in one go, use the
-- paginated form at the bottom of this file instead.
--
-- teams and team_members are deliberately absent. They are being dropped.

-- ── leads ────────────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.leads t;

-- ── email_campaigns ──────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.email_campaigns t;

-- ── conversations ────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.conversations t;

-- ── activity_logs ────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.activity_logs t;

-- ── settings ─────────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.settings t;

-- ── profiles ─────────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.profiles t;

-- ── icp_profiles ─────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.icp_profiles t;

-- ── sequences ────────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.sequences t;

-- ── sequence_templates ───────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.sequence_templates t;

-- ── sequence_enrollments ─────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.sequence_enrollments t;

-- ── meetings ─────────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.meetings t;

-- ── ab_tests ─────────────────────────────────────────────────────────────────
SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM public.ab_tests t;


-- ─────────────────────────────────────────────────────────────────────────────
-- PAGINATED FORM, if a table is too big to return at once.
--
-- Increase OFFSET by the LIMIT each time and save each page as
-- <table>.part1.json, <table>.part2.json and so on. The importer concatenates
-- any file matching <table>*.json, so the parts do not need merging by hand.
--
--   SELECT coalesce(jsonb_agg(t ORDER BY t.id), '[]'::jsonb)
--   FROM  (SELECT * FROM public.leads ORDER BY id LIMIT 200 OFFSET 0) t;
-- ─────────────────────────────────────────────────────────────────────────────
