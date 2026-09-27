-- ============================================================================
-- Google Calendar retry worker back on, with a backstop (2026-09-27)
--
-- Found: the retry worker (process-google-sync-jobs) had been switched off by hand
-- since 2026-08-25 (no migration records it; the queue's errors show Google's
-- "Rate Limit Exceeded"). 873 jobs waited; 857 only refreshed the "Casa Tabor
-- details" description, queued every time the planner rewrote an event's steps.
-- Worse, 11 upcoming family events had never reached Google at all — nine
-- softball games bulk-inserted on 2026-09-18 during that day's 503 storm, a Feb 15
-- dental appointment, and Emme's Nov 17 strings — because each creation path asks
-- Google once, in the background, and swallows a failure; the retry that would
-- have caught it was off.
-- Now:
--   1. Only upcoming events queue a Google refresh when their details change.
--   2. A backstop queues any upcoming Casa event still missing from Google
--      (created after the sync went live on 2026-06-16; never school-run copies,
--      reminders or recurring templates), 25 per run.
--   3. Jobs for past or deleted events are dropped.
--   4. The worker runs by the cron rules: every 15 minutes, 10 jobs, vault key,
--      10 s timeout — about 40 Google writes an hour at most.
-- ============================================================================

-- 1. Details changed: only for events still ahead (a day's grace for today's).
create or replace function public.queue_google_projection_detail_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_event public.events%rowtype;
begin
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select *
  into v_event
  from public.events
  where id = v_event_id;

  if not found
    or v_event.event_type = 'reminder'
    or v_event.deleted_at is not null
    or v_event.status = 'cancelled'
    or v_event.start_time < now() - interval '1 day'
  then
    return null;
  end if;

  if v_event.series_id is not null
    or exists (
      select 1
      from public.event_series series
      where series.template_event_id = v_event_id
    )
  then
    return null;
  end if;

  perform public.enqueue_google_sync_job(
    v_event_id,
    null,
    'Google projection details changed.'
  );
  return null;
end;
$$;

-- 2. The backstop: upcoming Casa events that never reached Google.
create or replace function public.enqueue_missing_google_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_event record;
begin
  for v_event in
    select e.id
    from public.events e
    where e.google_event_id is null
      and e.deleted_at is null
      and e.status = 'confirmed'
      and e.event_type <> 'reminder'
      and coalesce(e.record_kind, 'single') = 'single'
      and e.series_id is null
      and e.start_time >= now()
      and e.created_at >= '2026-06-16'
      and e.created_at < now() - interval '10 minutes'
      and e.title !~* '^(drop off|pick up|pickup|dropoff)\m.*@'
      and not exists (
        select 1 from public.google_sync_jobs j
        where j.event_id = e.id and j.status in ('pending', 'retrying')
      )
    order by e.start_time
    limit 25
  loop
    perform public.enqueue_google_sync_job(v_event.id, null, 'Not in Google yet.');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 3. Nobody needs a refresh of a past or deleted event.
delete from public.google_sync_jobs j
using public.events e
where j.event_id = e.id
  and j.status = 'pending'
  and (e.start_time < now() - interval '1 day' or e.deleted_at is not null);

-- 4. The worker, by the cron rules.
do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'process-google-sync-jobs' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'process-google-sync-jobs',
  '4,19,34,49 * * * *',
  $$
  select public.enqueue_missing_google_events();
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-sync-jobs',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"limit":10}'::jsonb,
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
