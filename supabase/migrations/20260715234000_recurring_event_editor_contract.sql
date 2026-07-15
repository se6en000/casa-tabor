create or replace function public.recurrence_get_editor_context_core(
  p_selected_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_selected public.events%rowtype;
  v_series public.event_series%rowtype;
  v_template public.events%rowtype;
  v_all_count integer;
  v_future_count integer;
  v_all_exception_count integer;
  v_future_exception_count integer;
  v_paths constant text[] := array[
    'event.title', 'event.description', 'event.startTime', 'event.endTime',
    'event.durationMs', 'event.allDay', 'event.eventType', 'event.locationName',
    'event.address', 'event.lat', 'event.lng', 'assignments', 'enrichment',
    'transportationPlan', 'logistics', 'checklistDefinitions', 'actionDefinitions',
    'googleInvitees'
  ];
begin
  select * into v_selected
  from public.events
  where id = p_selected_event_id
    and record_kind = 'occurrence'
    and series_id is not null
    and deleted_at is null;
  if not found then raise exception 'Recurring occurrence not found'; end if;

  select * into v_series
  from public.event_series
  where id = v_selected.series_id
    and status = 'active';
  if not found then raise exception 'Active recurring series not found'; end if;

  select * into v_template
  from public.events
  where id = v_series.template_event_id;
  if not found then raise exception 'Recurring series template not found'; end if;

  select
    count(*)::integer,
    count(*) filter (where is_exception)::integer
  into v_all_count, v_all_exception_count
  from public.events
  where series_id = v_series.id
    and deleted_at is null;

  select
    count(*)::integer,
    count(*) filter (where is_exception)::integer
  into v_future_count, v_future_exception_count
  from public.events
  where series_id = v_series.id
    and deleted_at is null
    and (
      (v_selected.original_start_time is not null and original_start_time >= v_selected.original_start_time)
      or
      (v_selected.original_start_date is not null and original_start_date >= v_selected.original_start_date)
    );

  return jsonb_build_object(
    'selected_event_id', v_selected.id,
    'series', jsonb_build_object(
      'id', v_series.id,
      'revision', v_series.revision,
      'timezone', v_series.timezone,
      'recurrence_lines', v_series.recurrence_lines,
      'ownership', v_series.ownership,
      'template_event_id', v_series.template_event_id
    ),
    'effective_bundle', public.recurrence_build_event_snapshot(v_selected.id),
    'template_bundle', public.recurrence_build_event_snapshot(v_template.id),
    'exception_paths', v_selected.exception_paths,
    'inherited_paths', (
      select coalesce(jsonb_agg(path order by path), '[]'::jsonb)
      from unnest(v_paths) path
      where public.recurrence_path_is_inherited(v_selected.exception_paths, path)
    ),
    'impacts', jsonb_build_object(
      'this', jsonb_build_object(
        'occurrence_count', 1,
        'exception_count', case when v_selected.is_exception then 1 else 0 end
      ),
      'future', jsonb_build_object(
        'occurrence_count', v_future_count,
        'exception_count', v_future_exception_count
      ),
      'all', jsonb_build_object(
        'occurrence_count', v_all_count,
        'exception_count', v_all_exception_count
      )
    )
  );
end;
$$;

create or replace function public.recurrence_apply_event_patch(
  p_event_id uuid,
  p_patch jsonb,
  p_changed_paths text[],
  p_respect_exceptions boolean default false,
  p_series_revision bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_now timestamptz := now();
  v_can_title boolean;
  v_can_description boolean;
  v_can_schedule boolean;
  v_can_all_day boolean;
  v_can_type boolean;
  v_can_location boolean;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found: %', p_event_id; end if;

  v_can_title := 'event.title' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.title'));
  v_can_description := 'event.description' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.description'));
  v_can_schedule := (
    'event.startTime' = any(p_changed_paths)
    or 'event.endTime' = any(p_changed_paths)
    or 'event.durationMs' = any(p_changed_paths)
  ) and (
    not p_respect_exceptions
    or (
      ('event.startTime' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.startTime'))
      and ('event.endTime' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.endTime'))
      and ('event.durationMs' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.durationMs'))
    )
  );
  v_can_all_day := 'event.allDay' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.allDay'));
  v_can_type := 'event.eventType' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.eventType'));
  v_can_location := (
    'event.locationName' = any(p_changed_paths)
    or 'event.address' = any(p_changed_paths)
    or 'event.lat' = any(p_changed_paths)
    or 'event.lng' = any(p_changed_paths)
  ) and (
    not p_respect_exceptions
    or (
      ('event.locationName' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.locationName'))
      and ('event.address' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.address'))
      and ('event.lat' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.lat'))
      and ('event.lng' <> all(p_changed_paths) or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.lng'))
    )
  );

  update public.events
  set
    title = case when v_can_title then nullif(btrim(p_patch->>'title'), '') else title end,
    description = case when v_can_description then nullif(btrim(p_patch->>'description'), '') else description end,
    start_time = case
      when v_can_schedule and not p_respect_exceptions and p_patch ? 'start_time'
        then (p_patch->>'start_time')::timestamptz
      else start_time
    end,
    end_time = case
      when v_can_schedule and p_respect_exceptions and p_patch ? 'duration_ms'
        then start_time + ((p_patch->>'duration_ms')::bigint * interval '1 millisecond')
      when v_can_schedule and not p_respect_exceptions and p_patch ? 'end_time'
        then (p_patch->>'end_time')::timestamptz
      when v_can_schedule and p_patch ? 'duration_ms'
        then start_time + ((p_patch->>'duration_ms')::bigint * interval '1 millisecond')
      else end_time
    end,
    all_day = case when v_can_all_day and p_patch ? 'all_day' then (p_patch->>'all_day')::boolean else all_day end,
    event_type = case when v_can_type and p_patch ? 'event_type' then p_patch->>'event_type' else event_type end,
    location_name = case when v_can_location and p_patch ? 'location_name' then nullif(btrim(p_patch->>'location_name'), '') else location_name end,
    address = case when v_can_location and p_patch ? 'address' then nullif(btrim(p_patch->>'address'), '') else address end,
    lat = case when v_can_location and p_patch ? 'lat' then nullif(p_patch->>'lat', '')::double precision else lat end,
    lng = case when v_can_location and p_patch ? 'lng' then nullif(p_patch->>'lng', '')::double precision else lng end,
    series_revision_applied = coalesce(p_series_revision, series_revision_applied),
    updated_at = v_now
  where id = p_event_id;

  if (select end_time <= start_time from public.events where id = p_event_id) then
    raise exception 'Event end must follow event start';
  end if;
end;
$$;

revoke all on function public.recurrence_get_editor_context_core(uuid)
  from public, anon, authenticated;
grant execute on function public.recurrence_get_editor_context_core(uuid)
  to service_role;
