create table if not exists public.event_transportation_generation_queue (
  event_id uuid primary key references public.events(id) on delete cascade,
  requested_at timestamptz not null default now(),
  last_dispatched_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

alter table public.event_transportation_generation_queue enable row level security;
revoke all on public.event_transportation_generation_queue from anon, authenticated;
grant all on public.event_transportation_generation_queue to service_role;

create or replace function public.trigger_event_transportation_plan_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
  target_event_id uuid;
begin
  if tg_table_name = 'events' then
    target_event_id := new.id;
  elsif tg_op = 'DELETE' then
    target_event_id := old.event_id;
  else
    target_event_id := new.event_id;
  end if;
  if target_event_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name = 'events' and tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.all_day is not distinct from old.all_day
     and new.event_type is not distinct from old.event_type
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at
     and new.location_name is not distinct from old.location_name
     and new.address is not distinct from old.address then
    return new;
  end if;

  if tg_table_name = 'event_enrichments' and tg_op = 'UPDATE'
     and new.category is not distinct from old.category then
    return new;
  end if;

  insert into public.event_transportation_generation_queue(event_id, requested_at, last_error)
  values (target_event_id, now(), null)
  on conflict (event_id) do update set
    requested_at = excluded.requested_at,
    last_error = null;

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
    end if;
  exception when others then
    raise warning 'transportation plan generation dispatch failed for event %: %', target_event_id, sqlerrm;
  end;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.dispatch_pending_event_transportation_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
  pending record;
  dispatched integer := 0;
begin
  select decrypted_secret
  into trigger_secret
  from vault.decrypted_secrets
  where name = 'transportation_trigger_secret'
  limit 1;

  if trigger_secret is null then
    raise warning 'transportation generation worker skipped: missing trigger secret';
    return 0;
  end if;

  for pending in
    select event_id
    from public.event_transportation_generation_queue
    order by requested_at
    limit 50
  loop
    perform net.http_post(
      url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/ensure-event-transportation-plan',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Casa-Transportation-Trigger', trigger_secret
      ),
      body := jsonb_build_object('event_id', pending.event_id)
    );
    update public.event_transportation_generation_queue
    set last_dispatched_at = now(),
        attempts = attempts + 1
    where event_id = pending.event_id;
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;

revoke all on function public.dispatch_pending_event_transportation_plans() from public, anon, authenticated;
grant execute on function public.dispatch_pending_event_transportation_plans() to service_role;

do $$
declare
  job record;
begin
  for job in select jobid from cron.job where jobname = 'dispatch-event-transportation-plans'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
  perform cron.schedule(
    'dispatch-event-transportation-plans',
    '* * * * *',
    'select public.dispatch_pending_event_transportation_plans();'
  );
end;
$$;
