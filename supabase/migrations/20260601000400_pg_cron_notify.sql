-- Enable pg_cron extension (already available on Supabase)
create extension if not exists pg_cron;

-- Schedule notify-upcoming-events to run every 5 minutes
select cron.schedule(
  'notify-upcoming-events',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/notify-upcoming-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
      ),
      body := '{}'::jsonb
    )
  $$
);
