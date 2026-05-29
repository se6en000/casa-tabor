-- Notifications table: activity feed for the family command center
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  type         text not null, -- 'event_added' | 'event_updated' | 'event_enriched' | 'gmail_import' | 'conflict' | 'briefing_ready'
  title        text not null,
  body         text,
  event_id     uuid references public.events(id) on delete cascade,
  source       text,          -- 'manual' | 'ai' | 'gmail' | 'sms' | 'google_sync' | 'system'
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_created_at_idx on public.notifications(created_at desc);
create index if not exists notifications_read_idx on public.notifications(read) where read = false;

alter table public.notifications enable row level security;
create policy "allow all for authenticated" on public.notifications using (true) with check (true);

-- Trigger: auto-create notification on event INSERT
create or replace function public.notify_event_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (type, title, body, event_id, source)
  values (
    'event_added',
    'New event added',
    NEW.title,
    NEW.id,
    'manual'
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_event_added on public.events;
create trigger trg_notify_event_added
  after insert on public.events
  for each row
  execute function public.notify_event_added();

-- Trigger: auto-create notification on event UPDATE (title, time, or location changed)
create or replace function public.notify_event_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only notify if meaningful fields changed
  if (NEW.title <> OLD.title or NEW.start_time <> OLD.start_time or NEW.end_time <> OLD.end_time or NEW.location_name is distinct from OLD.location_name) then
    insert into public.notifications (type, title, body, event_id, source)
    values (
      'event_updated',
      'Event updated',
      NEW.title,
      NEW.id,
      'manual'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_event_updated on public.events;
create trigger trg_notify_event_updated
  after update on public.events
  for each row
  execute function public.notify_event_updated();

-- Trigger: notification when event gets AI enriched (enrichment inserted)
create or replace function public.notify_event_enriched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_title text;
begin
  select title into ev_title from public.events where id = NEW.event_id;
  insert into public.notifications (type, title, body, event_id, source)
  values (
    'event_enriched',
    'AI enriched event',
    ev_title,
    NEW.event_id,
    'ai'
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_event_enriched on public.event_enrichments;
create trigger trg_notify_event_enriched
  after insert on public.event_enrichments
  for each row
  execute function public.notify_event_enriched();
