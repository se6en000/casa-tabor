-- Alexa's house notes (canvas 60; Jake, Oct 7): the weekly look back over the week's conversations.
-- Sunday 9 PM Eastern (Monday 01:00 UTC); the function runs at most once in six days, whoever calls.
select cron.unschedule(jobid) from cron.job where jobname = 'house-notes';
select cron.schedule('house-notes', '0 1 * * 1', $$
  SELECT net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/house-notes',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);
