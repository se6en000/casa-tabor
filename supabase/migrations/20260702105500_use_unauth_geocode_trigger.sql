-- Switch trigger geocode calls to unauthenticated edge invocation
-- (function deployed with --no-verify-jwt).
create or replace function public.trigger_geocode_event_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.location_name), '') = '' and coalesce(trim(new.address), '') = '' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(trim(new.location_name), '') = coalesce(trim(old.location_name), '')
     and coalesce(trim(new.address), '') = coalesce(trim(old.address), '')
     and new.lat is not null
     and new.lng is not null then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/geocode-event-location',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('event_id', new.id)
  );

  return new;
exception when others then
  raise warning 'trigger_geocode_event_location failed for event %: %', new.id, sqlerrm;
  return new;
end;
$$;

do $$
declare
  queued_count integer := 0;
begin
  update public.events
  set address = address
  where coalesce(trim(address), '') <> ''
    and (status is null or status <> 'cancelled'::event_status)
    and end_time >= now()
    and (lat is null or lng is null);

  get diagnostics queued_count = row_count;
  raise notice 'Re-queued geocoding for % current/future events with addresses.', queued_count;
end;
$$;
