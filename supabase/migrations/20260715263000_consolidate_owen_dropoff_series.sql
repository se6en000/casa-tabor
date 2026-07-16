do $$
declare
  v_action_id constant text := 'consolidate-owen-dropoff-20260716';
  v_series_id constant uuid := 'cbe08165-93e3-4b64-b632-5f4274f17d65';
  v_template_id constant uuid := '7af118f4-c3b0-4971-9a8e-1a7a162328b1';
  v_legacy_series_id constant uuid := '49c4cb6f-92cc-4e1f-9505-35a506bb13df';
  v_enhanced_event_id constant uuid := '79baef3c-8f9a-4e03-856a-b0f14dbc9e55';
  v_connection_id constant uuid := 'b38436e4-a5ba-4040-8d0b-2a5a6f36549c';
  v_now timestamptz := now();
  v_count integer;
  v_template_patch jsonb;
  v_obsolete_google_ids jsonb;
  v_changed_paths text[] := array[
    'event.title', 'event.description', 'event.startTime', 'event.endTime',
    'event.durationMs', 'event.allDay', 'event.eventType', 'event.locationName',
    'event.address', 'event.lat', 'event.lng', 'assignments', 'enrichment',
    'transportationPlan', 'logistics', 'checklistDefinitions', 'actionDefinitions'
  ];
begin
  if exists (
    select 1 from public.recurrence_mutation_history where action_id = v_action_id
  ) then
    return;
  end if;

  select count(*) into v_count
  from public.events
  where title ilike '%Owen%Drop%Off%'
    and record_kind = 'single'
    and deleted_at is null
    and status <> 'cancelled';
  if v_count <> 57 then
    raise exception 'Owen Drop Off consolidation expected 57 active legacy rows, found %', v_count;
  end if;

  select count(*) into v_count
  from public.events
  where title ilike '%Owen%Drop%Off%'
    and record_kind = 'single'
    and deleted_at is null
    and status <> 'cancelled'
    and google_connection_id = v_connection_id
    and google_calendar_id = 'jacobrtabor@gmail.com';
  if v_count <> 57 then
    raise exception 'Every active legacy Owen Drop Off row must belong to the writable Jacob calendar';
  end if;

  select count(*) into v_count
  from public.event_series
  where id = v_series_id
    and template_event_id = v_template_id
    and status = 'deleted'
    and revision = 2
    and source_connection_id = v_connection_id;
  if v_count <> 1 then
    raise exception 'The reviewed finite Owen Drop Off canonical series changed before consolidation';
  end if;

  select count(*) into v_count
  from public.events
  where series_id = v_series_id
    and record_kind = 'occurrence'
    and deleted_at is not null;
  if v_count <> 18 then
    raise exception 'Owen Drop Off consolidation expected 18 retained canonical occurrences, found %', v_count;
  end if;

  select count(*) into v_count
  from public.event_plan_overrides
  where event_id = v_enhanced_event_id
    and transportation_plan->>'source' = 'manual'
    and jsonb_array_length(transportation_plan->'legs') = 2
    and transportation_plan#>>'{legs,0,purpose}' = 'dropoff'
    and transportation_plan#>>'{legs,1,purpose}' = 'return';
  if v_count <> 1 then
    raise exception 'The reviewed enhanced Owen Drop Off transportation plan changed before consolidation';
  end if;

  if exists (
    select 1
    from public.calendar_sync_operations
    where series_id in (v_series_id, v_legacy_series_id)
      and status in ('pending', 'retrying', 'running', 'failed')
  ) then
    raise exception 'Owen Drop Off consolidation requires an idle recurrence projection queue';
  end if;

  select coalesce(jsonb_agg(google_id order by google_id), '[]'::jsonb)
  into v_obsolete_google_ids
  from (
    select distinct google_id
    from (
      select google_event_id as google_id
      from public.events
      where title ilike '%Owen%Drop%Off%'
        and record_kind = 'single'
        and deleted_at is null
        and status <> 'cancelled'
      union all
      select google_recurring_event_id
      from public.event_series
      where id in (v_series_id, v_legacy_series_id)
    ) ids
    where google_id is not null
  ) obsolete;

  begin
    v_template_patch := public.recurrence_build_reusable_patch(v_enhanced_event_id);
  exception when others then
    raise exception 'Could not snapshot the enhanced Owen Drop Off bundle: %', sqlerrm;
  end;

  begin
    update public.events
    set deleted_at = null,
        purge_after = null,
        tombstone_origin = null,
        status = 'cancelled',
        google_event_id = null,
        google_ical_uid = null,
        google_etag = null,
        google_updated_at = null,
        updated_at = v_now
    where id = v_template_id;
  exception when others then
    raise exception 'Could not reactivate the finite Owen Drop Off template: %', sqlerrm;
  end;

  begin
    perform public.recurrence_apply_reusable_graph(
      v_template_id,
      v_template_patch,
      v_changed_paths,
      false,
      3
    );
  exception when others then
    raise exception 'Could not copy the enhanced Owen Drop Off bundle: %', sqlerrm;
  end;

  update public.events
  set start_time = '2026-07-16T12:30:00Z',
      end_time = '2026-07-16T13:00:00Z',
      updated_at = v_now
  where id = v_template_id;

  update public.events
  set deleted_at = coalesce(deleted_at, v_now),
      purge_after = coalesce(purge_after, v_now + interval '30 days'),
      tombstone_origin = 'recurrence',
      status = 'cancelled',
      google_event_id = null,
      google_ical_uid = null,
      google_etag = null,
      google_updated_at = null,
      is_exception = false,
      exception_paths = '[]'::jsonb,
      updated_at = v_now
  where series_id = v_series_id
    and record_kind = 'occurrence';

  update public.event_series
  set recurrence_lines = '["RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20260817T125959Z;BYDAY=MO,TU,WE,TH,FR"]'::jsonb,
      timezone = 'America/New_York',
      status = 'active',
      revision = 3,
      ownership = 'google_adopted',
      source_connection_id = v_connection_id,
      google_calendar_id = 'jacobrtabor@gmail.com',
      google_recurring_event_id = null,
      google_ical_uid = null,
      google_etag = null,
      google_updated_at = null,
      last_projected_revision = null,
      projection_hash = null,
      deleted_at = null,
      purge_after = null,
      materialization_error = null,
      updated_at = v_now
  where id = v_series_id;

  update public.events
  set deleted_at = v_now,
      purge_after = v_now + interval '30 days',
      tombstone_origin = 'user',
      status = 'cancelled',
      updated_at = v_now
  where title ilike '%Owen%Drop%Off%'
    and record_kind = 'single'
    and deleted_at is null
    and status <> 'cancelled';
  get diagnostics v_count = row_count;
  if v_count <> 57 then
    raise exception 'Owen Drop Off consolidation retired %, expected 57', v_count;
  end if;

  insert into public.calendar_sync_operations (
    action_id,
    operation_key,
    series_id,
    connection_id,
    operation_type,
    casa_revision,
    payload_snapshot,
    correlation_id
  )
  values (
    v_action_id,
    'family:all:recreate',
    v_series_id,
    v_connection_id,
    'recreate_projection',
    3,
    jsonb_build_object(
      'scope', 'all',
      'mutation_type', 'update',
      'changed_paths', to_jsonb(v_changed_paths),
      'obsolete_google_master_ids', v_obsolete_google_ids,
      'migration', 'legacy-owen-dropoff-consolidation'
    ),
    v_action_id
  );

  insert into public.recurrence_mutation_history (
    action_id,
    series_id,
    selected_event_id,
    scope,
    mutation_type,
    expected_series_revision,
    applied_series_revision,
    actor,
    correlation_id,
    request_payload,
    before_state,
    after_state,
    status
  )
  values (
    v_action_id,
    v_series_id,
    v_enhanced_event_id,
    'all',
    'update',
    2,
    3,
    '{"type":"guarded_production_migration"}'::jsonb,
    v_action_id,
    jsonb_build_object(
      'recurrence_lines', '["RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20260817T125959Z;BYDAY=MO,TU,WE,TH,FR"]'::jsonb,
      'enhanced_plan_source_event_id', v_enhanced_event_id
    ),
    jsonb_build_object(
      'active_legacy_rows', 57,
      'retained_canonical_occurrences', 18,
      'obsolete_google_ids', v_obsolete_google_ids
    ),
    jsonb_build_object(
      'series_id', v_series_id,
      'series_revision', 3,
      'google_sync_status', 'pending'
    ),
    'applied'
  );
end;
$$;
