-- The daily materializer back on (FAMILY_WALL_PLAN.md P3.19 step 1). It was left off in
-- 20260927160000 because five Casa-made copies of Emme's Thursday school runs would have filled in
-- ~175 duplicates. Those copies are retired (the routine resync, 2026-09-27): every live series is now
-- either ended or already filled, so the daily run only extends dates as time passes — next year's
-- birthday, the rest of the school year. By the cron rules: daily, 10 s timeout, key from the vault.

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'materialize-recurring-events' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'materialize-recurring-events',
  '17 7 * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/materialize-recurring-events',
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
