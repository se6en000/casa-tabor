-- ============================================================================
-- Stagger colliding cron schedules -- a real, active regression
--
-- Confirmed live via cron.job_run_details: complete-morning-prep-reminders,
-- process-family-data-index (both rescheduled today, 2026-09-22/23) and the
-- pre-existing dispatch-event-transportation-plans all used the bare
-- '*/15 * * * *' pattern and fired at the EXACT SAME INSTANT every 15
-- minutes (00:00:09.94-00:00:09.95 UTC, three jobs within milliseconds of
-- each other) -- a thundering-herd burst on a Micro-tier instance. A user's
-- calendar page load during this exact window took ~48 seconds;
-- scan-gmail-inbox's next tick two minutes later even failed outright with
-- "job startup timeout", a knock-on effect of the contention.
--
-- The two jobs already in this codebase that fire 4x/hour on purpose
-- (scan-gmail-inbox at :02/:17/:32/:47, sync-google-calendars at
-- :07/:22/:37/:52) already follow the right pattern: an offset minute list,
-- not '*/15'. The two jobs resumed today should have matched that from the
-- start. This restaggers them onto their own clear offsets (5 and 10),
-- leaving dispatch-event-transportation-plans's pre-existing schedule
-- untouched since it wasn't part of today's changes.
-- ============================================================================

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname in ('process-family-data-index', 'complete-morning-prep-reminders') loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'process-family-data-index',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/index-family-data',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"batch_size": 25}'::jsonb,
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

select cron.schedule(
  'complete-morning-prep-reminders',
  '10,25,40,55 * * * *',
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
