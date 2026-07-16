do $$
declare
  v_action_id constant text := 'finalize-owen-dropoff-google-projection-20260716';
  v_series_id constant uuid := 'cbe08165-93e3-4b64-b632-5f4274f17d65';
  v_connection_id constant uuid := 'b38436e4-a5ba-4040-8d0b-2a5a6f36549c';
  v_google_master_id constant text := 'ccb3ed9c4e77c42449c0ac32c79a56cb4';
  v_obsolete_ids constant jsonb := '[
    "f1u4v9a79fiq68tlo33so59su0",
    "otcr30u2864r59ebvo9q3pi4fo",
    "36md7snml752nn8e38101vk3p0",
    "76mfpltvr85kqr6s9ns7u1ojcg",
    "q33gssf7sf1th6gmmi281841gc",
    "58ovgmddiskvidvog104t3him8",
    "i33ttiv88nb5ovap3l3g5qae74",
    "841u18qr1qli6fei4s9kijsr2o",
    "jsbcvhd0ms0otkgu1v3b8b2q9s",
    "a0sguod8g8lkk3kogcs418ufmo",
    "qau0t03summb8csounkfdcpp8k",
    "d0avr7dhltc8ik83p7hl0hq9pg",
    "7n6g8ovg8qhfrqu6rnm1ei966c",
    "71jqv7pjh7k7h1cohl5kr97t8c",
    "qt49skk5tkhap443e9u0djn4q8",
    "v1fi129gl6pn3q2ag43m3pftv0",
    "qno73lb29gs3almukst2pmh014",
    "pu41lcbc4uebjvb2fs4l34tod8",
    "ccb3ed9c4e77c42449c0ac32c79a56cb4"
  ]'::jsonb;
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
    and source_connection_id = v_connection_id
    and google_recurring_event_id = v_google_master_id;
  if v_count <> 1 then
    raise exception 'Canonical Owen Drop Off Google identity changed before final projection';
  end if;

  select count(*) into v_count
  from public.events
  where series_id = v_series_id
    and record_kind = 'occurrence'
    and deleted_at is null
    and status = 'confirmed'
    and left(google_event_id, length(v_google_master_id) + 1) = v_google_master_id || '_';
  if v_count <> 23 then
    raise exception 'Expected 23 linked canonical Owen Drop Off instances, found %', v_count;
  end if;

  if exists (
    select 1 from public.calendar_sync_operations
    where status in ('pending', 'retrying', 'running', 'failed')
  ) then
    raise exception 'Final Owen Drop Off projection requires an idle recurrence queue';
  end if;

  update public.events
  set google_event_id = null,
      google_ical_uid = null,
      google_etag = null,
      google_updated_at = null,
      updated_at = now()
  where series_id = v_series_id
    and record_kind = 'occurrence';

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
      'changed_paths', '["transportationPlan"]'::jsonb,
      'obsolete_google_master_ids', v_obsolete_ids,
      'migration', 'finalize-owen-dropoff-google-projection'
    ),
    v_action_id
  );

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
    jsonb_build_object('obsolete_google_ids', v_obsolete_ids),
    jsonb_build_object('google_master_id', v_google_master_id, 'linked_instances', 23),
    '{"google_sync_status":"pending"}'::jsonb,
    'applied'
  );
end;
$$;
