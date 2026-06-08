-- Schedule Gmail inbox scan every 15 minutes
select cron.schedule(
  'scan-gmail-inbox',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scan-gmail-inbox',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_secret_HpkjyskE55sDH_hLNKEK1g_BVrA7f2U'
    ),
    body    := '{}'::jsonb
  );
  $$
);
