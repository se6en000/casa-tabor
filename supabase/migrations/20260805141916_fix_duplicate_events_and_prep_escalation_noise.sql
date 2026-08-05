-- Fixes production noise: an AI-created "Call in my Adderall prescription"
-- reminder got silently duplicated (created_event had zero duplicate
-- detection), so two near-identical events each spawned their own prep item
-- and independently escalating notifications. Separately, prep-item
-- escalation for priority>=3 items had no lead-time awareness at all — it
-- re-notified every ~6h from the moment the item was created until its due
-- date, regardless of whether that was in 20 minutes or 12 days, making
-- legitimately-far-out school/task items look exactly as urgent as
-- something due right now.
--
-- This migration:
--   1. Adds notifications.dedupe_key so apply-notification-policy can fire a
--      prep escalation at most once per lead-time bucket (see
--      prepEscalationBucket() in supabase/functions/apply-notification-policy),
--      instead of re-inserting a fresh row every policy cycle forever.
--   2. Stops the event_added / event_enriched triggers from firing for
--      event_type = 'reminder' — a lightweight reminder isn't a "calendar
--      event added" worth its own audit-log card; the prep-item escalation
--      is the actionable signal, so a single create_event action no longer
--      produces 2-3 near-duplicate Recent Activity cards.
--   3. One-time backfill: soft-deletes the specific duplicate Adderall event
--      created today, removes its (now-orphaned) prep item, and deletes the
--      notifications it already fired — so the fix takes effect immediately
--      rather than the duplicate lingering until Aug 16.

alter table public.notifications add column if not exists dedupe_key text;
create index if not exists notifications_dedupe_key_idx on public.notifications(dedupe_key) where dedupe_key is not null;

create or replace function public.notify_event_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' then return new; end if;
  if new.event_type = 'reminder' then return new; end if;
  insert into public.notifications (type, title, body, event_id, source)
  values ('event_added', 'New event added', new.title, new.id, 'manual');
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
  select title, record_kind, event_type into ev_title, ev_kind, ev_type
  from public.events
  where id = new.event_id;
  if ev_kind = 'series_template' then return new; end if;
  if ev_type = 'reminder' then return new; end if;
  insert into public.notifications (type, title, body, event_id, source)
  values ('event_enriched', 'AI enriched event', ev_title, new.event_id, 'system');
  return new;
end;
$$;

-- ── One-time backfill: clear the specific duplicate Adderall reminder ──
do $$
declare
  dupe_event_id uuid := 'af4cea6c-7383-4baa-916e-5a29c4b41616';
begin
  update public.events set deleted_at = now()
  where id = dupe_event_id and deleted_at is null;

  delete from public.prep_items where event_id = dupe_event_id;
  delete from public.notifications where event_id = dupe_event_id;
end;
$$;
