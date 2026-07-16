create or replace function public.google_sync_watchdog_dispatch(
  p_stale_after interval default interval '2 minutes',
  p_recurrence_limit integer default 25,
  p_legacy_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_recurrence_enabled boolean := false;
  v_recurrence_stale integer := 0;
  v_legacy_stale integer := 0;
  v_anon_key constant text := 'eyJhbGciOiJIUzI1NiIsImtpZCI6IlA5VnNLS0RxTVdGWEQ3VHEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NTU2MTAsImV4cCI6MjA2NDAzMTYxMH0.8jsI8AqiqMPS-gvBJXX0BpP8wWne3S0yqoXUuwykUeQ';
  v_headers jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', v_anon_key,
    'Authorization', 'Bearer ' || v_anon_key
  );
begin
  if p_stale_after < interval '30 seconds' then
    raise exception 'stale_after must be at least 30 seconds';
  end if;
  if p_recurrence_limit < 1 or p_recurrence_limit > 25 then
    raise exception 'recurrence_limit must be between 1 and 25';
  end if;
  if p_legacy_limit < 1 or p_legacy_limit > 25 then
    raise exception 'legacy_limit must be between 1 and 25';
  end if;

  select coalesce((value->>'google_sync_v2')::boolean, false)
  into v_recurrence_enabled
  from public.settings
  where key = 'recurrence_v2_flags';

  if v_recurrence_enabled then
    select count(*)
    into v_recurrence_stale
    from public.calendar_sync_operations
    where status in ('pending', 'retrying')
      and next_retry_at <= v_now - p_stale_after;

    if v_recurrence_stale > 0 then
      perform net.http_post(
        url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-recurrence-outbox',
        headers := v_headers,
        body := jsonb_build_object('limit', least(v_recurrence_stale, p_recurrence_limit))
      );
    end if;
  end if;

  select count(*)
  into v_legacy_stale
  from public.google_sync_jobs
  where status in ('pending', 'retrying')
    and next_retry_at <= v_now - p_stale_after;

  if v_legacy_stale > 0 then
    perform net.http_post(
      url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-sync-jobs',
      headers := v_headers,
      body := jsonb_build_object('limit', least(v_legacy_stale, p_legacy_limit))
    );
  end if;

  return jsonb_build_object(
    'checked_at', v_now,
    'recurrence_stale', v_recurrence_stale,
    'legacy_stale', v_legacy_stale
  );
end;
$$;

revoke all on function public.google_sync_watchdog_dispatch(interval, integer, integer) from public, anon, authenticated;
grant execute on function public.google_sync_watchdog_dispatch(interval, integer, integer) to service_role;

do $$
declare
  v_recurrence_cron_id bigint;
  v_legacy_cron_id bigint;
begin
  select jobid into v_recurrence_cron_id
  from cron.job
  where jobname = 'google-recurrence-outbox'
  limit 1;
  if v_recurrence_cron_id is not null then
    perform cron.unschedule(v_recurrence_cron_id);
  end if;

  select jobid into v_legacy_cron_id
  from cron.job
  where jobname = 'process-google-sync-jobs'
  limit 1;
  if v_legacy_cron_id is not null then
    perform cron.unschedule(v_legacy_cron_id);
  end if;
end;
$$;

select cron.schedule(
  'google-recurrence-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-recurrence-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsImtpZCI6IlA5VnNLS0RxTVdGWEQ3VHEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NTU2MTAsImV4cCI6MjA2NDAzMTYxMH0.8jsI8AqiqMPS-gvBJXX0BpP8wWne3S0yqoXUuwykUeQ',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsImtpZCI6IlA5VnNLS0RxTVdGWEQ3VHEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NTU2MTAsImV4cCI6MjA2NDAzMTYxMH0.8jsI8AqiqMPS-gvBJXX0BpP8wWne3S0yqoXUuwykUeQ'
    ),
    body := '{"limit":10}'::jsonb
  );
  $$
);

select cron.schedule(
  'process-google-sync-jobs',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-sync-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsImtpZCI6IlA5VnNLS0RxTVdGWEQ3VHEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NTU2MTAsImV4cCI6MjA2NDAzMTYxMH0.8jsI8AqiqMPS-gvBJXX0BpP8wWne3S0yqoXUuwykUeQ',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsImtpZCI6IlA5VnNLS0RxTVdGWEQ3VHEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NTU2MTAsImV4cCI6MjA2NDAzMTYxMH0.8jsI8AqiqMPS-gvBJXX0BpP8wWne3S0yqoXUuwykUeQ'
    ),
    body := '{"limit":10}'::jsonb
  );
  $$
);
