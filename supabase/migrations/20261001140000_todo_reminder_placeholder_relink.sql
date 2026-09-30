-- ============================================================================
-- Duplicate to-dos from the Casa <-> iOS sync, again (2026-09-30; Jake: "I don't see the to-do for email on my
-- active to dos"). The 2026-09-19 fallback relinks a reminder reflected back from iOS by title + due
-- semantics — but an undated Casa to-do comes back from iOS *dated*: the Mac exports its start_time (the
-- midnight placeholder of the day it was made) as a due date. So "Reply to Towhid Nishat" (made 12:37,
-- undated) came back at 12:41 due today, matched nothing, and was inserted again — and so did
-- "Halloween costumes: Order the costumes" (three copies), "Fix the Cracks: Select stucco company", …
-- Fix: an undated, unlinked Casa to-do also matches when the iOS due date is its placeholder day; and once
-- linked, that placeholder coming back never makes it dated.
-- ============================================================================

create or replace function public.upsert_todo_reminder_from_ios(p_ios_reminder_id text, p_title text, p_completed boolean, p_deleted boolean, p_ios_updated_at timestamp with time zone, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_due_has_time boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.event_ios_reminder_links%rowtype;
  v_event_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_has_due_date boolean;
  v_normalized_title text;
  v_fallback_event_id uuid;
  v_keep_undated boolean := false;
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
        -- An undated Casa to-do comes back from iOS due on its placeholder day (the Mac exports its
        -- start_time as a due date): the same to-do, not a new one (2026-09-30).
        or (v_has_due_date and not e.has_due_date
            and (p_due_date at time zone 'America/New_York')::date = (e.start_time at time zone 'America/New_York')::date)
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
    -- Its placeholder day coming back as a due date keeps it undated.
    select (not e.has_due_date and v_has_due_date
            and (p_due_date at time zone 'America/New_York')::date = (e.start_time at time zone 'America/New_York')::date)
      into v_keep_undated
    from public.events e where e.id = v_event_id;
    v_keep_undated := coalesce(v_keep_undated, false);

    if p_deleted then
      update public.events
        set deleted_at = coalesce(deleted_at, now()), updated_at = now()
        where id = v_event_id;
    else
      update public.events
        set title = coalesce(nullif(btrim(p_title), ''), title),
            status = (case when p_completed then 'cancelled' else 'confirmed' end)::event_status,
            start_time = case when v_keep_undated then start_time else v_start end,
            end_time = case when v_keep_undated then end_time else v_end end,
            has_due_date = case when v_keep_undated then false else v_has_due_date end,
            deleted_at = null,
            updated_at = now()
        where id = v_event_id;
    end if;

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
$function$;
