-- Per the user (2026-09-17): a date-only due date (no time component) should
-- default to 5pm household-local, not the 9am this function originally shipped with.
create or replace function public.upsert_todo_reminder_from_ios(
  p_ios_reminder_id text,
  p_title text,
  p_completed boolean,
  p_deleted boolean,
  p_ios_updated_at timestamptz,
  p_due_date timestamptz default null,
  p_due_has_time boolean default false
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

  if p_due_date is not null then
    if p_due_has_time then
      v_start := p_due_date;
    else
      v_start := (date_trunc('day', p_due_date at time zone 'America/New_York')
        + interval '17 hours') at time zone 'America/New_York';
    end if;
  else
    v_start := (date_trunc('day', now() at time zone 'America/New_York')
      + interval '23 hours 45 minutes') at time zone 'America/New_York';
  end if;
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
