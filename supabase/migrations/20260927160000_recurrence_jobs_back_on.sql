-- Repeating events, both ways (FAMILY_WALL_PLAN.md P3.19 step 1; Jake 2026-09-27: "I want them to be
-- real reoccurring events that will work in Casa and also in Google").
-- The recurrence jobs had been switched off outside the code (found off on 2026-09-27; the last
-- migration to schedule them was 20260814223000, at an every-minute outbox the cron rules forbid).
-- Back on, by the rules (≥15 min, 10 s timeout, key from the vault):
--   import-google-recurrence — adopts Google's repeating events as Casa series and links their
--     copies (the regular sync brings copies up to ~400 days out; google-sync-window.mjs).
--   process-google-recurrence-outbox — sends Casa's edits to a series to Google.
-- Left off: materialize-recurring-events. Five Casa-made copies of Emme's Thursday school-run
-- series have no dates filled in; run for every series it would add ~175 duplicate school runs.
-- It was run by hand, per series, for the family's yearly dates.

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname in ('import-google-recurrence-v2', 'google-recurrence-outbox') loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'import-google-recurrence-v2',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/import-google-recurrence',
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

select cron.schedule(
  'google-recurrence-outbox',
  '3,18,33,48 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-recurrence-outbox',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"limit":10}'::jsonb,
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
