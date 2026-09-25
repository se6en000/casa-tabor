-- Fix: deleting a reminder in Casa never reached the iOS Reminders sync, so the
-- Apple-side copy stayed alive and the next iOS->Casa poll recreated it in Casa.
-- Confirmed live 2026-09-24 -- a test reminder and a real household reminder both
-- resurrected with a brand-new id, last_modified_source 'ios', within a second of
-- each other.
--
-- get_todo_reminder_deltas (the Casa->iOS export) excluded any row whose
-- event_ios_reminder_links.last_modified_source = 'ios' -- meant to stop an
-- iOS-originated update from echoing back out, but it also permanently hid that
-- reminder's eventual deletion, since a reminder created in Casa and pushed to
-- Apple Reminders gets stamped 'ios' the moment the round trip completes and links
-- it (see upsert_todo_reminder_from_ios's fallback title-match). The other half --
-- deleteCalendarEvent hard-deleting instead of leaving a deleted_at tombstone -- is
-- fixed client-side in src/lib/eventMutations.ts, same commit.
--
-- Echo-loop suppression stays for ordinary (non-delete) updates; a deletion always
-- propagates regardless of who last touched the row -- a tombstone is not "an edit
-- iOS made that Casa is echoing back," it's the one signal that must never be
-- swallowed or the item can never actually go away.
create or replace function public.get_todo_reminder_deltas(
  p_since timestamptz,
  p_limit integer default 200
)
returns table (
  id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  updated_at timestamptz,
  ios_reminder_id text,
  sync_version bigint,
  last_modified_source text,
  deleted boolean,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.start_time,
    e.end_time,
    e.status,
    e.updated_at,
    l.ios_reminder_id,
    coalesce(l.sync_version, 1) as sync_version,
    coalesce(l.last_modified_source, 'casa') as last_modified_source,
    (e.deleted_at is not null) as deleted,
    e.deleted_at
  from public.events e
  left join public.event_ios_reminder_links l on l.event_id = e.id
  left join public.event_enrichments en on en.event_id = e.id
  where e.event_type = 'reminder'
    and (en.category is null or en.category <> 'morning_prep')
    and (coalesce(l.last_modified_source, 'casa') <> 'ios' or e.deleted_at is not null)
    and (p_since is null or e.updated_at > p_since)
  order by e.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
$$;
