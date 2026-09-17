-- To-Do list <-> Apple Reminders ("To Do" list) sync, mirroring the grocery
-- <-> "Shopping" sync architecture (see 20260624000100_grocery_sync_foundation.sql
-- and .github/instructions/ios-reminders-sync.instructions.md), but for the
-- app's existing "Today's To-Dos" surface -- which is just `events` rows with
-- event_type = 'reminder' (confirmed by reading TodaysTodosWidget.tsx: there is
-- no separate to-do table).
--
-- Sync bookkeeping lives in a dedicated link table rather than new columns on
-- `events` directly: `events` already has a dozen+ triggers (auto-geocode,
-- auto-enrich, conflict-analysis, transportation-plan generation, family-data
-- projection) that fire on insert/update, and bolting ios_reminder_id/
-- ios_updated_at/last_modified_source/sync_version straight onto that table
-- risks interacting with all of that unrelated automation. Keeping it separate
-- also sidesteps the fact that, unlike grocery_items, events.updated_at is not
-- trigger-maintained -- every write already sets it manually in application
-- code (see src/lib/eventMutations.ts), so we don't get an automatic version
-- bump here the way grocery_items does.
create table if not exists public.event_ios_reminder_links (
  event_id uuid primary key references public.events(id) on delete cascade,
  ios_reminder_id text unique,
  ios_updated_at timestamptz,
  last_modified_source text not null default 'casa',
  sync_version bigint not null default 1
);

create index if not exists event_ios_reminder_links_ios_reminder_id_idx
  on public.event_ios_reminder_links (ios_reminder_id)
  where ios_reminder_id is not null;

-- Casa -> iOS: read-only cursor export, mirroring sync-casa-to-ios's shape.
-- A dedicated RPC (rather than a client-side PostgREST join) avoids the nested
-- `!inner(...)` join pattern this repo's own guardrail
-- (tests/guardrails/query-anti-patterns.test.ts) prohibits in src/ -- edge
-- functions aren't scanned by that test, but the same discipline was applied
-- here for consistency with get_morning_prep_reminders.
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
security definer
set search_path = public
stable
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
    and coalesce(l.last_modified_source, 'casa') <> 'ios'
    and (p_since is null or e.updated_at > p_since)
  order by e.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
$$;

revoke all on function public.get_todo_reminder_deltas(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.get_todo_reminder_deltas(timestamptz, integer)
  to anon, authenticated, service_role;

-- iOS -> Casa: single atomic write per reminder (events + event_ios_reminder_links
-- together), per this repo's own guardrail that multi-table writes must be one
-- RPC/transaction, not sequential client calls.
--
-- The Mac-side "To Do" reminders never carry a due date in their sync payload
-- (confirmed against the actual live script, 2026-09-17) -- per the user, a
-- missing due date defaults to "end of today" (household-local). That default
-- is recomputed on every write this function makes, but only fires when the
-- source reminder was actually touched (title/completion changed) -- the
-- idempotency guard below skips anything not strictly newer than what's
-- stored, so an untouched to-do won't get silently rewritten just from time
-- passing. That's a deliberate trade-off to avoid the kind of forced-periodic-
-- rewrite churn that caused real incidents in the grocery sync's history.
create or replace function public.upsert_todo_reminder_from_ios(
  p_ios_reminder_id text,
  p_title text,
  p_completed boolean,
  p_deleted boolean,
  p_ios_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.event_ios_reminder_links%rowtype;
  v_event_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_ios_reminder_id is null or btrim(p_ios_reminder_id) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_reminder_id');
  end if;

  select * into v_link
  from public.event_ios_reminder_links
  where ios_reminder_id = p_ios_reminder_id;

  if v_link.event_id is not null
     and v_link.ios_updated_at is not null
     and p_ios_updated_at <= v_link.ios_updated_at then
    return jsonb_build_object('ok', true, 'skipped_stale', true);
  end if;

  v_start := (date_trunc('day', now() at time zone 'America/New_York')
    + interval '23 hours 45 minutes') at time zone 'America/New_York';
  v_end := v_start + interval '15 minutes';

  if v_link.event_id is not null then
    v_event_id := v_link.event_id;

    if p_deleted then
      update public.events
        set deleted_at = coalesce(deleted_at, now()), updated_at = now()
        where id = v_event_id;
    else
      update public.events
        set title = coalesce(nullif(btrim(p_title), ''), title),
            status = (case when p_completed then 'cancelled' else 'confirmed' end)::event_status,
            start_time = v_start,
            end_time = v_end,
            deleted_at = null,
            updated_at = now()
        where id = v_event_id;
    end if;

    update public.event_ios_reminder_links
      set ios_updated_at = p_ios_updated_at,
          last_modified_source = 'ios',
          sync_version = coalesce(sync_version, 1) + 1
      where event_id = v_event_id;

    return jsonb_build_object('ok', true, 'event_id', v_event_id, 'action', 'updated');
  end if;

  if p_deleted then
    return jsonb_build_object('ok', true, 'action', 'noop_delete_unknown');
  end if;

  insert into public.events (
    id, title, start_time, end_time, all_day, event_type, status,
    is_enriched, record_kind, created_at, updated_at
  )
  values (
    gen_random_uuid(), coalesce(nullif(btrim(p_title), ''), 'Untitled'), v_start, v_end, false,
    'reminder', (case when p_completed then 'cancelled' else 'confirmed' end)::event_status,
    true, 'single', now(), now()
  )
  returning id into v_event_id;

  insert into public.event_ios_reminder_links (
    event_id, ios_reminder_id, ios_updated_at, last_modified_source, sync_version
  )
  values (v_event_id, p_ios_reminder_id, p_ios_updated_at, 'ios', 1);

  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'action', 'inserted');
end;
$$;

revoke all on function public.upsert_todo_reminder_from_ios(text, text, boolean, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.upsert_todo_reminder_from_ios(text, text, boolean, boolean, timestamptz)
  to anon, authenticated, service_role;
