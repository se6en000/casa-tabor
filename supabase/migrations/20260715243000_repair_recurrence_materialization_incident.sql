do $$
declare
  v_series_id constant uuid := '8da8597c-493a-4632-9953-b8afebb416d8';
  v_event_id constant uuid := '93cc7016-5cdf-4189-a8e3-52f64f0fe1e1';
  v_bad_operation_id constant uuid := '522c27ea-5cc2-49c7-b94e-605abfd90ddf';
  v_incident_at constant timestamptz := '2026-07-15T23:11:41.194738Z';
  v_count integer;
  v_connection_id uuid;
begin
  select count(*) into v_count
  from public.events
  where series_id = v_series_id
    and record_kind = 'occurrence'
    and created_at = v_incident_at
    and updated_at = created_at
    and deleted_at is null
    and google_event_id is null
    and not is_exception
    and exception_paths = '[]'::jsonb;
  if v_count <> 405 then
    raise exception 'Incident repair expected 405 untouched generated rows, found %', v_count;
  end if;

  select count(*) into v_count
  from public.events
  where series_id = v_series_id
    and record_kind = 'occurrence'
    and created_at <> v_incident_at
    and deleted_at = v_incident_at
    and tombstone_origin = 'recurrence'
    and google_event_id is not null
    and not is_exception;
  if v_count <> 51 then
    raise exception 'Incident repair expected 51 recurrence-tombstoned Google rows, found %', v_count;
  end if;

  select count(*) into v_count
  from public.events
  where id = v_event_id
    and series_id = v_series_id
    and start_time = '2026-07-16T18:35:00Z'
    and end_time = '2026-07-16T21:05:00Z'
    and occurrence_key = '2026-07-16T14:30:00[America/New_York]'
    and is_exception;
  if v_count <> 1 then
    raise exception 'Selected incident occurrence no longer matches the reviewed state';
  end if;

  select connection_id into v_connection_id
  from public.calendar_sync_operations
  where id = v_bad_operation_id
    and event_id = v_event_id
    and operation_type = 'patch_instance'
    and status = 'pending'
    and attempts = 0
  for update;
  if not found then
    raise exception 'Bad Google operation is no longer safely cancellable';
  end if;

  update public.calendar_sync_operations
  set status = 'cancelled',
      completed_at = now(),
      last_error = 'Superseded by recurrence materialization incident repair.'
  where id = v_bad_operation_id;

  update public.events
  set deleted_at = null,
      purge_after = null,
      tombstone_origin = null,
      status = 'confirmed'
  where series_id = v_series_id
    and record_kind = 'occurrence'
    and created_at <> v_incident_at
    and deleted_at = v_incident_at
    and tombstone_origin = 'recurrence'
    and google_event_id is not null
    and not is_exception;
  get diagnostics v_count = row_count;
  if v_count <> 51 then
    raise exception 'Incident repair restored %, expected 51', v_count;
  end if;

  delete from public.events
  where series_id = v_series_id
    and record_kind = 'occurrence'
    and created_at = v_incident_at
    and updated_at = created_at
    and deleted_at is null
    and google_event_id is null
    and not is_exception
    and exception_paths = '[]'::jsonb;
  get diagnostics v_count = row_count;
  if v_count <> 405 then
    raise exception 'Incident repair removed %, expected 405', v_count;
  end if;

  update public.events
  set start_time = '2026-07-16T18:30:00Z',
      end_time = '2026-07-16T21:05:00Z',
      exception_paths = (
        select coalesce(jsonb_agg(path order by path), '[]'::jsonb)
        from jsonb_array_elements_text(exception_paths) as paths(path)
        where path <> 'event.startTime'
      ),
      updated_at = now()
  where id = v_event_id;

  insert into public.calendar_sync_operations (
    action_id,
    operation_key,
    series_id,
    event_id,
    connection_id,
    operation_type,
    casa_revision,
    payload_snapshot,
    correlation_id
  )
  values (
    'recurrence-incident-repair-20260715',
    'this:update-corrected',
    v_series_id,
    v_event_id,
    v_connection_id,
    'patch_instance',
    2,
    jsonb_build_object(
      'scope', 'this',
      'mutation_type', 'update',
      'repair', 'host-timezone-materialization'
    ),
    'recurrence-incident-repair-20260715'
  )
  on conflict (action_id, operation_key) do nothing;
end;
$$;
