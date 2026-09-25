-- Both active pg_cron jobs (the only 2 out of 19 that are currently enabled)
-- were running with timeout_milliseconds := 15000, exceeding the 10000ms
-- ceiling GUARDRAILS.md §4 mandates for jobs calling net.http_post. This
-- drifted silently because tests/guardrails/cron-governance.test.ts only
-- checks schedule *interval* in migration files, never checks the timeout
-- value embedded in the command text. Both jobs' 15-minute interval is
-- already compliant -- only the timeout needed correcting.
--
-- Rewritten 2026-09-25 for rebuilds: production's original (kept in its
-- migration history table) altered job ids 59 and 60 directly with inline
-- headers. Job ids differ on a rebuilt database, so this finds the same two
-- jobs by the function they call and only lowers their timeout, keeping each
-- job's existing auth headers.

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid, command
    from cron.job
    where command like '%/functions/v1/scan-gmail-inbox%'
       or command like '%/functions/v1/sync-calendars%'
  loop
    perform cron.alter_job(
      job_id := v_job.jobid,
      command := regexp_replace(v_job.command, 'timeout_milliseconds\s*:=\s*\d+', 'timeout_milliseconds := 10000', 'g')
    );
  end loop;
end;
$$;
