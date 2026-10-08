-- The calendars (Jake, Oct 8: "do the calendar feeds"): live music, comedy and trivia from local gig and trivia calendars,
-- read every morning by the scout function ({ action: 'calendars' }) and folded into the outings (one row per thing,
-- however many sources list it).
alter table public.outings drop constraint if exists outings_kind_check;
alter table public.outings add constraint outings_kind_check check (kind in ('restaurant', 'fitness', 'couple', 'family', 'music', 'comedy', 'trivia'));
alter table public.outings drop constraint if exists outings_source_check;
alter table public.outings add constraint outings_source_check check (source in ('search', 'places', 'email', 'calendar'));

-- Every morning at 5:30 Eastern (09:30 UTC). The key from the vault.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'scout-calendars' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'scout-calendars',
  '30 9 * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"action":"calendars"}'::jsonb,
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
