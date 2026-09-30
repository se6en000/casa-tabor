-- ============================================================================
-- To-dos with a day but no time showed "12:00 AM" on the iPhone (2026-09-30; Jake: "let's do it"): the
-- yearbook page, the field-trip lunch, the pink shirt. Casa keeps them all-day (the day's midnight, no time),
-- but the export didn't say so, so the Mac set midnight as a time. Now:
--  * the export says all_day (last column), so the Mac can set a date-only due date ("Tomorrow");
--  * coming back date-only, an all-day to-do stays that day, all-day — before, a date-only due became 5 PM,
--    and unlinked it matched nothing (a second copy). Given a real time on the iPhone, it becomes timed.
-- A new date-only reminder made on the iPhone is still 5 PM that day, as before.
-- ============================================================================

drop function if exists public.get_todo_reminder_deltas(timestamptz, integer);

create function public.get_todo_reminder_deltas(p_since timestamptz, p_limit integer default 200)
returns table(id uuid, title text, start_time timestamptz, end_time timestamptz, status text, updated_at timestamptz, ios_reminder_id text, sync_version bigint, last_modified_source text, deleted boolean, deleted_at timestamptz, has_due_date boolean, all_day boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
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
    e.deleted_at,
    coalesce(e.has_due_date, true) as has_due_date,
    coalesce(e.all_day, false) as all_day
  from public.events e
  left join public.event_ios_reminder_links l on l.event_id = e.id
  left join public.event_enrichments en on en.event_id = e.id
  where e.event_type = 'reminder'
    and (en.category is null or en.category <> 'morning_prep')
    and (coalesce(l.last_modified_source, 'casa') <> 'ios' or e.deleted_at is not null)
    and (p_since is null or e.updated_at > p_since)
  order by e.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
$function$;

revoke all on function public.get_todo_reminder_deltas(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.get_todo_reminder_deltas(timestamptz, integer)
  to anon, authenticated, service_role;

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
  v_date_only boolean;
  v_day_start timestamptz;
  v_all_day boolean := false;
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
  v_date_only := v_has_due_date and not p_due_has_time;
  v_day_start := (date_trunc('day', p_due_date at time zone 'America/New_York')) at time zone 'America/New_York';

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
        -- A Casa to-do with a day and no time (all_day) goes to iOS date-only and comes back that way (2026-09-30).
        or (v_date_only and e.has_due_date and e.all_day and e.start_time = v_day_start)
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
    -- An all-day to-do stays all-day while its due has no time (date-only, or the old Mac's midnight): that
    -- day's midnight, not 5 PM. Given a real time on the iPhone, it becomes a timed to-do.
    select e.all_day and not v_keep_undated and v_has_due_date
           and (v_date_only or p_due_date = v_day_start)
      into v_all_day
    from public.events e where e.id = v_event_id;
    v_all_day := coalesce(v_all_day, false);
    if v_all_day then
      v_start := v_day_start;
      v_end := v_start + interval '15 minutes';
    end if;

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
            all_day = v_all_day,
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
