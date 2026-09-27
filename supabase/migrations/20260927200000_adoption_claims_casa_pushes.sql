-- Casa's own pushes aren't adopted twice (FAMILY_WALL_PLAN.md: school-run duplicates, 2026-09-27).
-- Routine school runs were pushed to Google with a series row that had no connection; the importer
-- looked for (connection, Google id), didn't find it, and adopted the same Google series again — every
-- Thursday run existed twice in Casa. Now a live series with the same Google id and no connection is
-- claimed (its connection filled in). Same function as 20260927170000 otherwise.

CREATE OR REPLACE FUNCTION public.recurrence_adopt_google_master_core(p_resource_id uuid, p_explicit boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resource public.google_recurrence_resources%rowtype;
  v_connection public.calendar_connections%rowtype;
  v_existing public.event_series%rowtype;
  v_template public.events%rowtype;
  v_template_id uuid;
  v_series_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_all_day boolean;
  v_timezone text;
  v_title text;
  v_description text;
  v_location text;
  v_timing_changed boolean;
begin
  select * into v_resource
  from public.google_recurrence_resources
  where id = p_resource_id
  for update;
  if not found or v_resource.resource_type <> 'master' then
    raise exception 'Google recurring master resource not found';
  end if;
  if v_resource.retired_at is not null or v_resource.google_status = 'cancelled' then
    raise exception 'Cancelled or retired Google recurring masters cannot be adopted';
  end if;

  select * into v_connection
  from public.calendar_connections
  where id = v_resource.connection_id
    and is_enabled
  for update;
  if not found then raise exception 'Enabled Google connection not found'; end if;
  if v_connection.adoption_policy <> 'automatic' and not p_explicit then
    raise exception 'Explicit adoption is required for this Google connection';
  end if;

  v_all_day := (v_resource.payload->'start'->>'date') is not null;
  v_timezone := coalesce(
    nullif(v_resource.payload->'start'->>'timeZone', ''),
    nullif(v_resource.payload->'end'->>'timeZone', ''),
    'America/New_York'
  );
  v_start := case
    when v_all_day then ((v_resource.payload->'start'->>'date')::date::timestamp at time zone v_timezone)
    else (v_resource.payload->'start'->>'dateTime')::timestamptz
  end;
  v_end := case
    when v_all_day then ((v_resource.payload->'end'->>'date')::date::timestamp at time zone v_timezone)
    else (v_resource.payload->'end'->>'dateTime')::timestamptz
  end;
  v_title := coalesce(nullif(btrim(v_resource.payload->>'summary'), ''), '(untitled)');
  v_description := nullif(v_resource.payload->>'description', '');
  v_location := nullif(v_resource.payload->>'location', '');

  -- A series Casa pushed itself may not record its connection (routine school runs before
  -- 2026-09-27); claim it instead of adopting the same Google series a second time.
  select * into v_existing
  from public.event_series
  where google_recurring_event_id = v_resource.google_event_id
    and (source_connection_id = v_connection.id or source_connection_id is null)
    and deleted_at is null
  order by (source_connection_id is not null) desc, created_at
  limit 1
  for update;
  if found then
    if v_existing.source_connection_id is null then
      update public.event_series
      set source_connection_id = v_connection.id,
          google_calendar_id = coalesce(google_calendar_id, v_connection.calendar_id)
      where id = v_existing.id;
      v_existing.source_connection_id := v_connection.id;
    end if;
    if v_resource.google_updated_at is not null
      and v_resource.google_updated_at > coalesce(v_existing.google_updated_at, '-infinity'::timestamptz)
      and v_start is not null and v_end is not null and v_end > v_start
    then
      select * into v_template from public.events where id = v_existing.template_event_id for update;
      v_timing_changed := v_template.start_time is distinct from v_start
        or v_template.end_time is distinct from v_end
        or v_template.all_day is distinct from v_all_day
        or v_existing.recurrence_lines is distinct from v_resource.recurrence_lines
        or v_existing.timezone is distinct from v_timezone;

      update public.events
      set title = v_title, description = v_description, location_name = v_location, address = v_location,
          start_time = v_start, end_time = v_end, all_day = v_all_day,
          google_etag = v_resource.google_etag, google_updated_at = v_resource.google_updated_at
      where id = v_existing.template_event_id;

      update public.events
      set title = v_title, description = v_description, location_name = v_location, address = v_location
      where series_id = v_existing.id
        and record_kind = 'occurrence'
        and deleted_at is null
        and not coalesce(is_exception, false)
        and start_time >= now() - interval '1 day'
        and (title, description, location_name) is distinct from (v_title, v_description, v_location);

      update public.event_series
      set recurrence_lines = v_resource.recurrence_lines,
          timezone = v_timezone,
          revision = revision + case when v_timing_changed then 1 else 0 end,
          google_ical_uid = v_resource.google_ical_uid,
          google_etag = v_resource.google_etag,
          google_updated_at = v_resource.google_updated_at,
          updated_at = now()
      where id = v_existing.id;
    else
      v_timing_changed := false;
      update public.event_series
      set google_ical_uid = v_resource.google_ical_uid,
          google_etag = v_resource.google_etag,
          google_updated_at = v_resource.google_updated_at,
          updated_at = now()
      where id = v_existing.id;
    end if;
    update public.google_recurrence_resources
    set adoption_status = 'adopted',
        adopted_series_id = v_existing.id
    where id = v_resource.id;
    return jsonb_build_object('series_id', v_existing.id, 'created', false, 'timing_changed', v_timing_changed);
  end if;

  if v_start is null or v_end is null or v_end <= v_start then
    raise exception 'Google recurring master has invalid start/end data';
  end if;

  insert into public.events (
    title, description, start_time, end_time, all_day,
    location_name, address, status, is_enriched, event_type,
    record_kind, google_event_id, google_calendar_id,
    google_connection_id, source_member_id,
    google_ical_uid, google_etag, google_updated_at
  ) values (
    v_title, v_description, v_start, v_end, v_all_day,
    v_location, v_location, 'cancelled', false, 'event',
    'series_template', null, v_connection.calendar_id,
    v_connection.id, v_connection.family_member_id,
    v_resource.google_ical_uid, v_resource.google_etag, v_resource.google_updated_at
  )
  returning id into v_template_id;

  insert into public.event_series (
    template_event_id, timezone, recurrence_lines, ownership,
    source_connection_id, google_calendar_id, google_recurring_event_id,
    google_ical_uid, google_etag, google_updated_at
  ) values (
    v_template_id,
    v_timezone,
    v_resource.recurrence_lines,
    case when v_connection.access_mode = 'writable' then 'google_adopted' else 'read_only_import' end,
    v_connection.id,
    v_connection.calendar_id,
    v_resource.google_event_id,
    v_resource.google_ical_uid,
    v_resource.google_etag,
    v_resource.google_updated_at
  )
  returning id into v_series_id;

  update public.google_recurrence_resources
  set adoption_status = 'adopted',
      adopted_series_id = v_series_id
  where id = v_resource.id;
  return jsonb_build_object('series_id', v_series_id, 'template_event_id', v_template_id, 'created', true, 'timing_changed', true);
end;
$function$;
