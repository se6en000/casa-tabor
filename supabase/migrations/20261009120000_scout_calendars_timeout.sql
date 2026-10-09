-- The calendars now read a week of Weekend Broward and the Palm Beach Improv (Jake, Oct 9): more than 10 seconds.
select cron.unschedule('scout-calendars');
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
    timeout_milliseconds := 120000
  )
  from (
    select decrypted_secret as k
    from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
    limit 1
  ) s;
  $$
);
