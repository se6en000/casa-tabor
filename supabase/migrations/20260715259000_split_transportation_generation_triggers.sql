create or replace function public.enqueue_event_transportation_plan_generation(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
begin
  if target_event_id is null then return; end if;
  if not exists (select 1 from public.events where id = target_event_id) then return; end if;

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
end;
$$;

create or replace function public.trigger_event_transportation_plan_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
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
  perform public.enqueue_event_transportation_plan_generation(new.id);
  return new;
end;
$$;

create or replace function public.trigger_event_transportation_member_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_event_transportation_plan_generation(
    case when tg_op = 'DELETE' then old.event_id else new.event_id end
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.trigger_event_transportation_enrichment_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.category is not distinct from old.category then
    return new;
  end if;
  perform public.enqueue_event_transportation_plan_generation(new.event_id);
  return new;
end;
$$;

drop trigger if exists auto_transportation_plan_on_event_change on public.events;
create trigger auto_transportation_plan_on_event_change
  after insert or update of title, start_time, end_time, all_day, event_type,
    status, deleted_at, location_name, address
  on public.events
  for each row
  execute function public.trigger_event_transportation_plan_generation();

drop trigger if exists auto_transportation_plan_on_member_change on public.event_members;
create trigger auto_transportation_plan_on_member_change
  after insert or update of role, family_member_id or delete
  on public.event_members
  for each row
  execute function public.trigger_event_transportation_member_generation();

drop trigger if exists auto_transportation_plan_on_enrichment_change on public.event_enrichments;
create trigger auto_transportation_plan_on_enrichment_change
  after insert or update of category
  on public.event_enrichments
  for each row
  execute function public.trigger_event_transportation_enrichment_generation();

revoke all on function public.enqueue_event_transportation_plan_generation(uuid) from public, anon, authenticated;
revoke all on function public.trigger_event_transportation_plan_generation() from public, anon, authenticated;
revoke all on function public.trigger_event_transportation_member_generation() from public, anon, authenticated;
revoke all on function public.trigger_event_transportation_enrichment_generation() from public, anon, authenticated;
