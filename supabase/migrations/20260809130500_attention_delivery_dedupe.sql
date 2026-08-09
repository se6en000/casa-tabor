-- Treat notifications as delivery/audit records, not independent attention
-- items. Each routine event lifecycle delivery is recorded at most once.

drop index if exists public.notifications_dedupe_key_idx;
create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

create or replace function public.notify_event_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' then return new; end if;
  if new.event_type = 'reminder' then return new; end if;
  insert into public.notifications (type, title, body, event_id, source, dedupe_key)
  values (
    'event_added',
    'New event added',
    new.title,
    new.id,
    'manual',
    'event_added:' || new.id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

create or replace function public.notify_event_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' then return new; end if;
  if new.event_type = 'reminder' then return new; end if;
  if (
    new.title <> old.title
    or new.start_time <> old.start_time
    or new.end_time <> old.end_time
    or new.location_name is distinct from old.location_name
  ) then
    insert into public.notifications (type, title, body, event_id, source, dedupe_key)
    values (
      'event_updated',
      'Event updated',
      new.title,
      new.id,
      'manual',
      'event_updated:' || new.id::text
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.notify_event_enriched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_title text;
  ev_kind text;
  ev_type text;
begin
  select title, record_kind, event_type
  into ev_title, ev_kind, ev_type
  from public.events
  where id = new.event_id;
  if ev_kind = 'series_template' then return new; end if;
  if ev_type = 'reminder' then return new; end if;
  insert into public.notifications (type, title, body, event_id, source, dedupe_key)
  values (
    'event_enriched',
    'AI enriched event',
    ev_title,
    new.event_id,
    'system',
    'event_enriched:' || new.event_id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
