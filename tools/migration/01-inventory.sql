-- STEP 1 of the migration: find out what we are actually moving.
--
-- Run this in the Lovable SQL editor and send the result back. It decides how
-- the export in step 2 has to work: a table of 400 rows can leave as one JSON
-- blob, a table of 400,000 cannot.
--
-- Nothing here writes. It is safe to run as often as you like.

SELECT
  c.relname                                        AS table_name,
  c.reltuples::bigint                              AS est_rows,
  pg_size_pretty(pg_total_relation_size(c.oid))    AS total_size,
  pg_total_relation_size(c.oid)                    AS size_bytes,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = c.relname) AS columns,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = c.relname
      AND data_type IN ('json', 'jsonb'))          AS json_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = c.relname
      AND data_type = 'ARRAY')                     AS array_cols
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
  AND  c.relkind = 'r'
ORDER  BY pg_total_relation_size(c.oid) DESC;
