-- Trigger conflict analysis automatically when events or event-member assignments change.

create or replace function public.trigger_analyze_conflicts_for_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
  pivot_start timestamptz;
begin
  pivot_start := date_trunc('day', coalesce(new.start_time, old.start_time, now()));

  select decrypted_secret
    into service_role_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;

  if service_role_key is null then
    raise warning 'trigger_analyze_conflicts_for_event: missing SUPABASE_SERVICE_ROLE_KEY secret';
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/analyze-conflicts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'range_start', pivot_start,
      'range_end', pivot_start + interval '14 days'
    )
  );

  return coalesce(new, old);
exception when others then
  raise warning 'trigger_analyze_conflicts_for_event failed: %', sqlerrm;
  return coalesce(new, old);
end;
$$;

create or replace function public.trigger_analyze_conflicts_for_event_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
  event_start timestamptz;
  event_id_value uuid;
begin
  event_id_value := coalesce(new.event_id, old.event_id);

  select start_time
    into event_start
  from public.events
  where id = event_id_value;

  if event_start is null then
    event_start := now();
  end if;

  select decrypted_secret
    into service_role_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;

  if service_role_key is null then
    raise warning 'trigger_analyze_conflicts_for_event_member: missing SUPABASE_SERVICE_ROLE_KEY secret';
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/analyze-conflicts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'range_start', date_trunc('day', event_start),
      'range_end', date_trunc('day', event_start) + interval '14 days'
    )
  );

  return coalesce(new, old);
exception when others then
  raise warning 'trigger_analyze_conflicts_for_event_member failed: %', sqlerrm;
  return coalesce(new, old);
end;
$$;

drop trigger if exists auto_analyze_conflicts_on_event_change on public.events;
create trigger auto_analyze_conflicts_on_event_change
  after insert or update of start_time, end_time, status
  on public.events
  for each row
  execute function public.trigger_analyze_conflicts_for_event();

drop trigger if exists auto_analyze_conflicts_on_event_member_change on public.event_members;
create trigger auto_analyze_conflicts_on_event_member_change
  after insert or update or delete
  on public.event_members
  for each row
  execute function public.trigger_analyze_conflicts_for_event_member();
