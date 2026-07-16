do $$
declare
  v_action_id constant text := 'remove-reimported-owen-dropoff-instances-20260716';
  v_series_id constant uuid := 'cbe08165-93e3-4b64-b632-5f4274f17d65';
  v_google_master_id constant text := 'ccb3ed9c4e77c42449c0ac32c79a56cb4';
  v_now timestamptz := now();
  v_count integer;
begin
  if exists (
    select 1 from public.recurrence_mutation_history where action_id = v_action_id
  ) then
    return;
  end if;

  select count(*) into v_count
  from public.event_series
  where id = v_series_id
    and status = 'active'
    and revision = 3
    and google_recurring_event_id = v_google_master_id;
  if v_count <> 1 then
    raise exception 'Canonical Owen Drop Off series changed before duplicate-import cleanup';
  end if;

  select count(*) into v_count
  from public.events
  where record_kind = 'single'
    and title = 'Owen Drop Off'
    and deleted_at is null
    and status = 'confirmed'
    and left(google_event_id, length(v_google_master_id) + 1) = v_google_master_id || '_';
  if v_count <> 18 then
    raise exception 'Expected 18 freshly reimported Owen Drop Off instances, found %', v_count;
  end if;

  create temporary table owen_dropoff_reimport_snapshot
  on commit drop
  as
  select
    id,
    start_time,
    google_event_id,
    google_calendar_id,
    google_connection_id,
    google_ical_uid,
    google_etag,
    google_updated_at
  from public.events
  where record_kind = 'single'
    and title = 'Owen Drop Off'
    and deleted_at is null
    and status = 'confirmed'
    and left(google_event_id, length(v_google_master_id) + 1) = v_google_master_id || '_';

  update public.events
  set google_event_id = null,
      google_ical_uid = null,
      google_etag = null,
      google_updated_at = null,
      updated_at = v_now
  where id in (select id from owen_dropoff_reimport_snapshot);

  update public.events canonical
  set google_event_id = duplicate.google_event_id,
      google_calendar_id = duplicate.google_calendar_id,
      google_connection_id = duplicate.google_connection_id,
      google_ical_uid = duplicate.google_ical_uid,
      google_etag = duplicate.google_etag,
      google_updated_at = duplicate.google_updated_at,
      updated_at = v_now
  from owen_dropoff_reimport_snapshot duplicate
  where canonical.series_id = v_series_id
    and canonical.record_kind = 'occurrence'
    and canonical.start_time = duplicate.start_time
    and duplicate.google_event_id is not null;
  get diagnostics v_count = row_count;
  if v_count <> 18 then
    raise exception 'Linked %, expected 18 canonical Owen Drop Off occurrences', v_count;
  end if;

  update public.events
  set deleted_at = v_now,
      purge_after = v_now + interval '30 days',
      tombstone_origin = 'google',
      status = 'cancelled',
      updated_at = v_now
  where id in (select id from owen_dropoff_reimport_snapshot);
  get diagnostics v_count = row_count;
  if v_count <> 18 then
    raise exception 'Retired %, expected 18 reimported Owen Drop Off instances', v_count;
  end if;

  insert into public.recurrence_mutation_history (
    action_id, series_id, scope, mutation_type,
    expected_series_revision, applied_series_revision,
    actor, correlation_id, request_payload, before_state, after_state, status
  )
  values (
    v_action_id, v_series_id, 'all', 'update',
    3, 3,
    '{"type":"guarded_production_migration"}'::jsonb,
    v_action_id,
    jsonb_build_object('google_master_id', v_google_master_id),
    '{"reimported_single_instances":18}'::jsonb,
    '{"linked_canonical_occurrences":18,"retired_duplicate_rows":18}'::jsonb,
    'applied'
  );
end;
$$;
