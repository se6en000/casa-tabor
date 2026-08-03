-- Reuse coordinates already stored on another event before calling Google Places.
-- Recurring instances and repeated imports commonly share the same destination.

create index if not exists events_geocode_address_cache_idx
  on public.events (lower(btrim(address)))
  where lat is not null
    and lng is not null
    and coalesce(btrim(address), '') <> '';

create index if not exists events_geocode_location_cache_idx
  on public.events (lower(btrim(location_name)))
  where lat is not null
    and lng is not null
    and coalesce(btrim(location_name), '') <> '';

create or replace function public.reset_event_coords_on_location_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cached_lat numeric;
  cached_lng numeric;
begin
  if coalesce(btrim(new.location_name), '') = ''
     and coalesce(btrim(new.address), '') = '' then
    new.lat := null;
    new.lng := null;
    return new;
  end if;

  if tg_op = 'INSERT' and new.lat is not null and new.lng is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(btrim(new.location_name), '') = coalesce(btrim(old.location_name), '')
     and coalesce(btrim(new.address), '') = coalesce(btrim(old.address), '') then
    return new;
  end if;

  if coalesce(btrim(new.address), '') <> '' then
    select event.lat, event.lng
      into cached_lat, cached_lng
    from public.events as event
    where event.id <> new.id
      and event.lat is not null
      and event.lng is not null
      and lower(btrim(event.address)) = lower(btrim(new.address))
    order by event.updated_at desc
    limit 1;
  else
    select event.lat, event.lng
      into cached_lat, cached_lng
    from public.events as event
    where event.id <> new.id
      and event.lat is not null
      and event.lng is not null
      and lower(btrim(event.location_name)) = lower(btrim(new.location_name))
    order by event.updated_at desc
    limit 1;
  end if;

  new.lat := cached_lat;
  new.lng := cached_lng;
  return new;
end;
$$;

create or replace function public.trigger_geocode_event_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
begin
  if new.record_kind = 'series_template' then
    return new;
  end if;

  if coalesce(btrim(new.location_name), '') = ''
     and coalesce(btrim(new.address), '') = '' then
    return new;
  end if;

  if new.lat is not null and new.lng is not null then
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
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/geocode-event-location',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('event_id', new.id)
  );

  return new;
exception when others then
  raise warning 'trigger_geocode_event_location failed for event %: %', new.id, sqlerrm;
  return new;
end;
$$;
