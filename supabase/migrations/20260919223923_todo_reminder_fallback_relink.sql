-- ============================================================================
-- Fix duplicate to-do reminders from the Casa <-> iOS sync
--
-- sync-casa-todos-to-ios (get_todo_reminder_deltas) hands the Mac everything
-- it needs to tag a newly-created iOS reminder so it recognizes it later, but
-- there's no call for the Mac to report the new ios_reminder_id back --
-- event_ios_reminder_links never gets created for the Casa-origin side. When
-- the Mac's import poller later sees that same reminder reflected back from
-- iOS, upsert_todo_reminder_from_ios only ever matched by ios_reminder_id,
-- found nothing, and unconditionally inserted a brand new Casa event.
-- Confirmed live: ~90 duplicate reminder pairs going back to July, plus one
-- freshly reproduced case (created 2026-09-19 21:59:30, duplicated 22:08:19).
--
-- Fix: before assuming a not-yet-linked ios_reminder_id is a genuinely new
-- reminder, fall back to matching an existing, still-unlinked Casa-origin
-- reminder by title + due-date semantics, and link to that instead of
-- inserting a duplicate.
-- ============================================================================

create or replace function public.upsert_todo_reminder_from_ios(
  p_ios_reminder_id text,
  p_title text,
  p_completed boolean,
  p_deleted boolean,
  p_ios_updated_at timestamptz,
  p_due_date timestamptz default null,
  p_due_has_time boolean default true
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
  v_has_due_date boolean;
  v_normalized_title text;
  v_fallback_event_id uuid;
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

  v_has_due_date := p_due_date is not null;

  if v_has_due_date then
    if p_due_has_time then
      v_start := p_due_date;
    else
      v_start := (date_trunc('day', p_due_date at time zone 'America/New_York')
        + interval '17 hours') at time zone 'America/New_York';
    end if;
  else
    v_start := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
  end if;
  v_end := v_start + interval '15 minutes';
  v_normalized_title := lower(btrim(coalesce(nullif(btrim(p_title), ''), 'Untitled')));

  -- This ios_reminder_id has never been linked before. Before assuming it's a
  -- genuinely new reminder, check for an existing, still-unlinked Casa-origin
  -- reminder with the same title + due semantics -- almost always this is the
  -- Mac's Casa->iOS export of that exact reminder being reflected back for
  -- the first time, not a new item. Dateless reminders match on title alone
  -- (has_due_date=false on both sides) since their start_time is just a daily
  -- placeholder, not a real value to compare.
  if v_link.event_id is null and not p_deleted then
    select e.id into v_fallback_event_id
    from public.events e
    where e.event_type = 'reminder'
      and e.deleted_at is null
      and e.record_kind = 'single'
      and lower(btrim(e.title)) = v_normalized_title
      and (
        (v_has_due_date and e.has_due_date and e.start_time = v_start)
        or (not v_has_due_date and not e.has_due_date)
      )
      and not exists (
        select 1 from public.event_ios_reminder_links l
        where l.event_id = e.id
      )
    order by e.created_at asc
    limit 1;

    if v_fallback_event_id is not null then
      v_link.event_id := v_fallback_event_id;
    end if;
  end if;

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
            has_due_date = v_has_due_date,
            deleted_at = null,
            updated_at = now()
        where id = v_event_id;
    end if;

    -- Upsert (not a plain update) -- a fallback-matched event has no existing
    -- link row yet, so a plain update would silently affect zero rows.
    insert into public.event_ios_reminder_links (
      event_id, ios_reminder_id, ios_updated_at, last_modified_source, sync_version
    )
    values (v_event_id, p_ios_reminder_id, p_ios_updated_at, 'ios', 1)
    on conflict (event_id) do update set
      ios_reminder_id = excluded.ios_reminder_id,
      ios_updated_at = excluded.ios_updated_at,
      last_modified_source = 'ios',
      sync_version = coalesce(public.event_ios_reminder_links.sync_version, 1) + 1;

    return jsonb_build_object(
      'ok', true,
      'event_id', v_event_id,
      'action', case when v_fallback_event_id is not null then 'linked_existing' else 'updated' end
    );
  end if;

  if p_deleted then
    return jsonb_build_object('ok', true, 'action', 'noop_delete_unknown');
  end if;

  insert into public.events (
    id, title, start_time, end_time, all_day, has_due_date, event_type, status,
    is_enriched, record_kind, created_at, updated_at
  )
  values (
    gen_random_uuid(), coalesce(nullif(btrim(p_title), ''), 'Untitled'), v_start, v_end, false, v_has_due_date,
    'reminder', (case when p_completed then 'cancelled' else 'confirmed' end)::event_status,
    true, 'single', now(), now()
  )
  returning id into v_event_id;

  insert into public.event_ios_reminder_links (
    event_id, ios_reminder_id, ios_updated_at, last_modified_source, sync_version
  )
  values (v_event_id, p_ios_reminder_id, p_ios_updated_at, 'ios', 1);

  return jsonb_build_object('ok', true, 'action', 'inserted', 'event_id', v_event_id);
end;
$$;
