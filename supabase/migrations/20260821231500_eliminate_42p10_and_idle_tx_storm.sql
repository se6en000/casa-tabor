-- ============================================================================
-- Eliminate 42P10 ON CONFLICT Errors & Stagger pg_cron Schedules
-- 1. Restore unique index on ai_drawer_debug_events(dedupe_key) for upsert compatibility
-- 2. Stagger high-frequency cron jobs from 1-minute to 5-15 minute intervals
-- 3. Ensure clean unique constraints across all target upsert tables
-- ============================================================================

-- 1. Unique constraint for ai_drawer_debug_events upsert (fixes 42P10)
create unique index if not exists ai_drawer_debug_events_dedupe_key_uidx 
  on public.ai_drawer_debug_events (dedupe_key) 
  where (dedupe_key is not null);

-- 2. Ensure unique constraint on push_subscriptions(endpoint)
create unique index if not exists push_subscriptions_endpoint_uidx 
  on public.push_subscriptions (endpoint);

-- 3. Reschedule and stagger cron jobs to eliminate concurrent connection exhaustion

-- Unschedule 1-minute spam jobs
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid, jobname from cron.job
    where jobname in (
      'google-recurrence-outbox',
      'process-family-data-index',
      'dispatch-event-transportation-plans',
      'process-google-sync-jobs'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

-- Staggered Schedules:
-- Family Data Indexing (Every 5 minutes at :01, :06, :11, ...)
select cron.schedule(
  'process-family-data-index',
  '1-59/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/index-family-data',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'
    ),
    body    := '{"batch_size": 10}'::jsonb
  );
  $$
);

-- Google Recurrence Outbox (Every 5 minutes at :02, :07, :12, ...)
select cron.schedule(
  'google-recurrence-outbox',
  '2-59/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-recurrence-outbox',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'
    ),
    body    := '{"limit":10}'::jsonb
  );
  $$
);

-- Process Google Sync Jobs (Every 10 minutes at :04, :14, :24, ...)
select cron.schedule(
  'process-google-sync-jobs',
  '4-59/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-sync-jobs',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'
    ),
    body    := '{"limit":10}'::jsonb
  );
  $$
);
