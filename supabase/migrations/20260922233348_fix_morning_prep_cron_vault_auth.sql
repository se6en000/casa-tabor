-- ============================================================================
-- Fix complete-morning-prep-reminders: 668/668 runs failed since 2026-09-15
--
-- Its schedule (20260915190000_pg_cron_morning_prep_sweep.sql) reads
-- current_setting('app.supabase_url'/'app.supabase_anon_key') -- custom GUCs
-- that were never set anywhere in this database. Confirmed live via
-- cron.job_run_details: every single run since creation errored with
-- `unrecognized configuration parameter "app.supabase_url"`. A repo-wide grep
-- confirms this was the only active cron job using that (nonexistent) pattern;
-- every other working job resolves its anon key from
-- vault.decrypted_secrets(SUPABASE_ANON_KEY), same as the 2026-09-21
-- index-worker fix.
--
-- Net effect while broken: today's already-past "morning_prep" reminders
-- (the Bedtime Prep Checklist's user-added items) never got auto-completed --
-- 4 sat open past their morning window as of this fix.
-- ============================================================================

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'complete-morning-prep-reminders' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'complete-morning-prep-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/complete-morning-prep-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select decrypted_secret as k
    from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
    limit 1
  ) s;
  $$
);
