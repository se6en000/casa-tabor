-- Fix sync-google-calendars cron: replace broken current_setting() auth with hardcoded key
select cron.unschedule('sync-google-calendars');

select cron.schedule(
  'sync-google-calendars',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/sync-calendars',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_secret_HpkjyskE55sDH_hLNKEK1g_BVrA7f2U'
    ),
    body    := '{}'::jsonb
  );
  $$
);
