-- Pause the scheduled jobs, and put the schedule into version control.
--
-- Until now the pg_cron schedule existed only in the hosting provider's
-- dashboard. It could not be reviewed, reproduced, or restored, and it could
-- not be paused from this repository. This migration does both: it records
-- what the schedule was, and it switches every active job off.
--
-- Captured 13 September 2026, before pausing:
--
--   jobid  jobname                      schedule (UTC)          runs/day
--   -----  ---------------------------  ----------------------  --------
--       9  auto-discover-every-6h       0 */6 * * *                    4
--      10  auto-follow-up-every-2h      0 */2 * * *                   12
--      11  daily-outreach-every-2h      0 8,10,12,14,16 * * *          5
--      12  daily-outreach-9am           0 6 * * *                      1
--      13  process-sequences-every-2h   0 */2 * * *                   12
--
-- 34 invocations a day, of which 30 can send: daily-outreach 6,
-- auto-follow-up 12, process-sequences 12. Note that jobs 10 and 13 share the
-- same expression, so they fire simultaneously — two senders drawing on the
-- same daily cap while counting it differently, which is a known defect.
--
-- social-discover has no job of its own; it runs only when auto-discover
-- chains to it.
--
-- Times are UTC. Kenya is UTC+3, so "daily-outreach-9am" (0 6 * * *) is indeed
-- 09:00 EAT, while the every-2h jobs begin at 03:00 EAT — outside the
-- active_hours the Settings screen collects and no sender reads.
--
-- ---------------------------------------------------------------------------
-- Pause
--
-- alter_job rather than unschedule, so the definitions survive and a single
-- statement brings them back:
--
--   SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE NOT active;
--
-- Do not add that line here. This migration only ever pauses.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  paused int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'cron schema not present (CI or a fresh database) - nothing to pause';
    RETURN;
  END IF;

  SELECT count(*) INTO paused FROM cron.job WHERE active;

  IF paused = 0 THEN
    RAISE NOTICE 'No active cron jobs - nothing to pause';
    RETURN;
  END IF;

  PERFORM cron.alter_job(j.jobid, active := false)
  FROM   cron.job j
  WHERE  j.active;

  RAISE NOTICE 'Paused % cron job(s)', paused;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privilege to alter cron jobs - pause them in the dashboard';
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job not readable - nothing to pause';
END $$;
