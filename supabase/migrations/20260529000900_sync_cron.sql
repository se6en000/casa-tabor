-- Enable pg_cron and pg_net extensions (required for scheduled HTTP calls)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule sync-calendars edge function every 15 minutes
select cron.schedule(
  'sync-google-calendars',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/sync-calendars',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
