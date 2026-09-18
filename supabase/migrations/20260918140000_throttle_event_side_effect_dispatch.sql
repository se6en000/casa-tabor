-- ============================================================================
-- Throttle eager event side-effect dispatch (enrichment + transportation plan)
--
-- Adding events -- especially in bulk -- was taking down the whole REST API
-- with 503s. Two per-row triggers each fire a synchronous net.http_post from
-- inside Postgres with no throttle: auto_enrich_on_insert (enrich-event) and
-- the transportation-plan generation triggers on events/event_members/
-- event_enrichments (enqueue_event_transportation_plan_generation ->
-- ensure-event-transportation-plan). The transportation path in particular
-- fires *twice* per event for one logical "create event with attendees"
-- action, once from the events trigger and once from the event_members
-- trigger.
--
-- A prior incident (20260821231500_eliminate_42p10_and_idle_tx_storm.sql)
-- hit the same connection-exhaustion failure mode from a runaway per-minute
-- "dispatch-event-transportation-plans" cron job and unscheduled it, but
-- only rescheduled 3 of the 4 jobs it killed at a safe interval -- the
-- transportation-plan backstop sweep was never rescheduled, leaving only the
-- unthrottled eager path with nothing to catch what it drops.
--
-- Fix, in order:
--   1. Dedupe same-event re-dispatch within a few seconds (fixes the
--      events + event_members double-fire for one creation).
--   2. Add a shared burst throttle: past a small cap of dispatches in a
--      short window, skip the eager net.http_post entirely.
--   3. Reschedule the transportation-plan backstop sweep (the function
--      already exists -- dispatch_pending_event_transportation_plans --
--      it just hasn't had a cron job calling it since 2026-08-21) at a
--      safe 15-minute interval, so anything skipped by the throttle still
--      gets processed. The enrichment side already has an equivalent
--      backstop (enrich-pending-events, every 10 minutes, filters on
--      events.is_enriched = false) -- it just wasn't being leaned on.
-- ============================================================================

-- 1. Shared burst-throttle log for eager event side-effect dispatch.
create table if not exists public.event_side_effect_dispatch_log (
  id bigserial primary key,
  dispatched_at timestamptz not null default now()
);

create index if not exists event_side_effect_dispatch_log_dispatched_at_idx
  on public.event_side_effect_dispatch_log (dispatched_at);

alter table public.event_side_effect_dispatch_log enable row level security;
revoke all on public.event_side_effect_dispatch_log from anon, authenticated;
grant all on public.event_side_effect_dispatch_log to service_role;

create or replace function public.event_side_effect_dispatch_allowed(
  p_max_per_window integer default 6,
  p_window interval default interval '10 seconds'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  delete from public.event_side_effect_dispatch_log where dispatched_at < now() - interval '2 minutes';

  select count(*) into recent_count
  from public.event_side_effect_dispatch_log
  where dispatched_at > now() - p_window;

  if recent_count >= p_max_per_window then
    return false;
  end if;

  insert into public.event_side_effect_dispatch_log default values;
  return true;
end;
$$;

revoke all on function public.event_side_effect_dispatch_allowed(integer, interval) from public, anon, authenticated;
grant execute on function public.event_side_effect_dispatch_allowed(integer, interval) to service_role;

-- 2. Transportation-plan dispatch: dedupe same-event re-fire + honor the burst throttle.
create or replace function public.enqueue_event_transportation_plan_generation(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
  prior_dispatched_at timestamptz;
begin
  if target_event_id is null then return; end if;
  if not exists (select 1 from public.events where id = target_event_id) then return; end if;

  select last_dispatched_at into prior_dispatched_at
  from public.event_transportation_generation_queue
  where event_id = target_event_id;

  insert into public.event_transportation_generation_queue(event_id, requested_at, last_error)
  values (target_event_id, now(), null)
  on conflict (event_id) do update set
    requested_at = excluded.requested_at,
    last_error = null;

  -- The events trigger and the event_members trigger both fire for one
  -- "create event with attendees" action -- the queue row above already
  -- records the request; skip the redundant second immediate dispatch.
  if prior_dispatched_at is not null and prior_dispatched_at > now() - interval '5 seconds' then
    return;
  end if;

  -- Under a burst (many events inserted at once), skip eager dispatch and
  -- let the periodic backstop sweep (dispatch-event-transportation-plans,
  -- every 15 minutes) drain the queue at a safe, rate-limited pace instead.
  if not public.event_side_effect_dispatch_allowed() then
    return;
  end if;

  begin
    select decrypted_secret
    into trigger_secret
    from vault.decrypted_secrets
    where name = 'transportation_trigger_secret'
    limit 1;

    if trigger_secret is not null then
      perform net.http_post(
        url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/ensure-event-transportation-plan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Casa-Transportation-Trigger', trigger_secret
        ),
        body := jsonb_build_object('event_id', target_event_id)
      );
      update public.event_transportation_generation_queue
      set last_dispatched_at = now(),
          attempts = attempts + 1
      where event_id = target_event_id;
    end if;
  exception when others then
    raise warning 'transportation plan generation dispatch failed for event %: %', target_event_id, sqlerrm;
  end;
end;
$$;

-- 3. Enrichment dispatch: honor the same burst throttle, fall back to the
--    existing enrich-pending-events sweep (is_enriched = false) on skip.
create or replace function public.trigger_enrich_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' or new.event_type = 'reminder' then
    return new;
  end if;

  if not public.event_side_effect_dispatch_allowed() then
    return new;
  end if;

  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/enrich-event',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('event_id', new.id)
  );
  return new;
exception when others then
  raise warning 'event enrichment dispatch failed for event %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- 4. Restore the transportation-plan backstop sweep at a safe interval.
--    dispatch_pending_event_transportation_plans() already exists
--    (20260715257000_durable_transportation_generation_queue.sql) -- it
--    just hasn't had a cron job calling it since 20260821231500 unscheduled
--    the unsafe per-minute version and never replaced it.
do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'dispatch-event-transportation-plans'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'dispatch-event-transportation-plans',
    '*/15 * * * *',
    $cron$select public.dispatch_pending_event_transportation_plans();$cron$
  );
end;
$$;
