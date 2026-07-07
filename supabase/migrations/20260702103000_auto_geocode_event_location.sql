-- Automatically geocode event coordinates whenever location fields change.
-- This keeps map snapshots reliable no matter which client writes the event.

create or replace function public.reset_event_coords_on_location_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(trim(new.location_name), '') = '' and coalesce(trim(new.address), '') = '' then
      new.lat := null;
      new.lng := null;
    end if;
    return new;
  end if;

  if coalesce(trim(new.location_name), '') is distinct from coalesce(trim(old.location_name), '')
     or coalesce(trim(new.address), '') is distinct from coalesce(trim(old.address), '') then
    new.lat := null;
    new.lng := null;
  end if;

  if coalesce(trim(new.location_name), '') = '' and coalesce(trim(new.address), '') = '' then
    new.lat := null;
    new.lng := null;
  end if;

  return new;
end;
$$;

drop trigger if exists reset_coords_on_event_location_change on public.events;
create trigger reset_coords_on_event_location_change
  before insert or update of location_name, address
  on public.events
  for each row
  execute function public.reset_event_coords_on_location_change();

create or replace function public.trigger_geocode_event_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
begin
  if coalesce(trim(new.location_name), '') = '' and coalesce(trim(new.address), '') = '' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(trim(new.location_name), '') = coalesce(trim(old.location_name), '')
     and coalesce(trim(new.address), '') = coalesce(trim(old.address), '') then
    return new;
  end if;

  select decrypted_secret
    into service_role_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;

  if service_role_key is null then
    raise warning 'trigger_geocode_event_location: missing SUPABASE_SERVICE_ROLE_KEY secret';
    return new;
  end if;

  perform net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/geocode-event-location',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body    := jsonb_build_object('event_id', new.id)
  );

  return new;
exception when others then
  raise warning 'trigger_geocode_event_location failed for event %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists auto_geocode_on_event_location_change on public.events;
create trigger auto_geocode_on_event_location_change
  after insert or update of location_name, address
  on public.events
  for each row
  execute function public.trigger_geocode_event_location();
