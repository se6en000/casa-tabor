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
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
          || '/functions/v1/process-google-recurrence-outbox',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'SUPABASE_SERVICE_ROLE_KEY'
            limit 1
          )
        ),
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
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
        || '/functions/v1/process-google-sync-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json'),
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
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'google-sync-watchdog'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'google-sync-watchdog',
  '* * * * *',
  $$
  select public.google_sync_watchdog_dispatch(interval '2 minutes', 25, 25);
  $$
);
