-- Captures production changes that were made outside migrations, so that
-- replaying every migration on an empty database reproduces production
-- exactly (verified 2026-09-25 against a throwaway Supabase branch).
--
-- Every statement is written to be a no-op on production: functions are
-- re-created with production's current bodies, and all other steps are
-- guarded (if not exists / if exists). Recorded as applied in production
-- via migration repair rather than executed there.

-- 1. Function bodies hot-fixed directly in production ------------------------
-- recurrence_apply_scoped_mutation_without_exception_policy_core: production definition as of 2026-09-25
CREATE OR REPLACE FUNCTION public.recurrence_apply_scoped_mutation_without_exception_policy_core(p_action_id text, p_selected_event_id uuid, p_scope text, p_mutation_type text, p_expected_series_revision bigint, p_changed_paths text[] DEFAULT ARRAY[]::text[], p_detail_patch jsonb DEFAULT '{}'::jsonb, p_series_patch jsonb DEFAULT '{}'::jsonb, p_actor jsonb DEFAULT '{}'::jsonb, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_selected public.events%rowtype;
  v_selected_series public.event_series%rowtype;
  v_root public.event_series%rowtype;
  v_root_template public.events%rowtype;
  v_existing public.recurrence_mutation_history%rowtype;
  v_family_ids uuid[];
  v_child_ids uuid[];
  v_obsolete_google_ids text[];
  v_duplicate_key text;
  v_new_revision bigint;
  v_family_paths text[] := array[
    'event.title', 'event.description', 'event.startTime', 'event.endTime',
    'event.durationMs', 'event.allDay', 'event.eventType', 'event.locationName',
    'event.address', 'event.lat', 'event.lng', 'assignments', 'enrichment',
    'transportationPlan', 'logistics', 'checklistDefinitions', 'actionDefinitions'
  ];
  v_canonical_patch jsonb;
  v_template_patch jsonb;
  v_template_start timestamptz;
  v_template_end timestamptz;
  v_event public.events%rowtype;
  v_affected integer := 0;
  v_operation_id uuid;
  v_google_sync_enabled boolean := false;
begin
  select * into v_existing
  from public.recurrence_mutation_history
  where action_id = p_action_id;
  if found then
    return jsonb_build_object(
      'success', v_existing.status = 'applied',
      'idempotent_replay', true,
      'history_id', v_existing.id,
      'series_id', v_existing.series_id,
      'series_revision', v_existing.applied_series_revision,
      'result', v_existing.after_state
    );
  end if;

  select * into v_selected from public.events where id = p_selected_event_id;
  if not found or v_selected.series_id is null then
    raise exception 'Recurring occurrence not found';
  end if;
  select * into v_selected_series from public.event_series where id = v_selected.series_id;
  if not found then raise exception 'Recurring series not found'; end if;

  if p_scope = 'future'
    and v_selected_series.split_occurrence_key is not null
    and v_selected_series.split_occurrence_key = v_selected.occurrence_key
  then
    return public.recurrence_apply_segment_mutation_core(
      p_action_id, p_selected_event_id, 'all', p_mutation_type,
      p_expected_series_revision, p_changed_paths, p_detail_patch,
      p_series_patch, p_actor, p_correlation_id
    );
  end if;

  if p_scope <> 'all' or p_mutation_type <> 'update' then
    return public.recurrence_apply_segment_mutation_core(
      p_action_id, p_selected_event_id, p_scope, p_mutation_type,
      p_expected_series_revision, p_changed_paths, p_detail_patch,
      p_series_patch, p_actor, p_correlation_id
    );
  end if;

  if p_expected_series_revision is distinct from v_selected_series.revision then
    raise exception 'Recurring series changed: expected revision %, current revision %',
      p_expected_series_revision, v_selected_series.revision using errcode = 'P0001', detail = 'RECURRENCE_REVISION_CONFLICT';
  end if;
  if v_selected_series.ownership = 'read_only_import' then
    raise exception 'Read-only recurring series must be adopted before editing';
  end if;
  if jsonb_typeof(p_series_patch->'recurrence_lines') <> 'array' then
    raise exception 'Entire linked series updates require recurrence_lines';
  end if;

  with recursive ancestors as (
    select series.* from public.event_series series where series.id = v_selected_series.id
    union all
    select parent.*
    from public.event_series parent
    join ancestors child on child.parent_series_id = parent.id
  )
  select * into v_root
  from ancestors
  where parent_series_id is null
  limit 1;
  if not found then raise exception 'Recurring family root not found'; end if;

  with recursive family as (
    select id from public.event_series where id = v_root.id
    union all
    select child.id
    from public.event_series child
    join family parent on child.parent_series_id = parent.id
  )
  select array_agg(id order by id) into v_family_ids from family;

  perform 1
  from public.event_series
  where id = any(v_family_ids)
  order by id
  for update;

  select * into v_root_template
  from public.events
  where id = v_root.template_event_id
  for update;

  delete from public.events event
  where event.series_id = any(v_family_ids)
    and event.status = 'cancelled'
    and event.google_event_id is null
    and event.deleted_at is null
    and event.exception_paths = '[]'::jsonb
    and not exists (select 1 from public.event_members item where item.event_id = event.id)
    and not exists (select 1 from public.event_enrichments item where item.event_id = event.id)
    and not exists (select 1 from public.event_plan_overrides item where item.event_id = event.id)
    and not exists (select 1 from public.event_logistics item where item.event_id = event.id)
    and not exists (select 1 from public.event_checklist_items item where item.event_id = event.id)
    and not exists (select 1 from public.event_action_items item where item.event_id = event.id);

  select occurrence_key into v_duplicate_key
  from public.events
  where series_id = any(v_family_ids)
    and deleted_at is null
    and occurrence_key is not null
  group by occurrence_key
  having count(*) > 1
  limit 1;
  if v_duplicate_key is not null then
    raise exception 'Linked recurrence family has duplicate occurrence key: %', v_duplicate_key;
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_child_ids
  from public.event_series where id = any(v_family_ids) and id <> v_root.id;
  select coalesce(array_agg(google_recurring_event_id), array[]::text[])
  into v_obsolete_google_ids
  from public.event_series
  where id = any(v_child_ids) and google_recurring_event_id is not null;

  update public.events
  set series_id = v_root.id
  where series_id = any(v_child_ids);

  v_new_revision := greatest(
    v_root.revision,
    (select coalesce(max(revision), 0) from public.event_series where id = any(v_family_ids))
  ) + 1;

  v_canonical_patch := public.recurrence_build_reusable_patch(v_selected.id) || p_detail_patch;
  v_template_start := (
    (v_root_template.start_time at time zone v_root.timezone)::date
    + (coalesce(
        nullif(v_canonical_patch#>>'{event,start_time}', '')::timestamptz,
        v_selected.start_time
      ) at time zone v_root.timezone)::time
  ) at time zone v_root.timezone;
  v_template_end := v_template_start
    + (coalesce(
        nullif(v_canonical_patch#>>'{event,duration_ms}', '')::bigint,
        extract(epoch from (v_selected.end_time - v_selected.start_time))::bigint * 1000
      ) * interval '1 millisecond');
  v_template_patch := jsonb_set(
    jsonb_set(v_canonical_patch, '{event,start_time}', to_jsonb(v_template_start::text), true),
    '{event,end_time}', to_jsonb(v_template_end::text), true
  );

  perform public.recurrence_apply_reusable_graph(
    v_root_template.id, v_template_patch, v_family_paths, false, v_new_revision
  );
  for v_event in
    select * from public.events
    where series_id = v_root.id and deleted_at is null
    order by original_start_time nulls last, original_start_date nulls last
    for update
  loop
    update public.events
    set exception_paths = '[]'::jsonb,
        is_exception = false
    where id = v_event.id;
    perform public.recurrence_apply_reusable_graph(
      v_event.id, v_canonical_patch, v_family_paths, true, v_new_revision
    );
    v_affected := v_affected + 1;
  end loop;

  update public.event_series
  set recurrence_lines = p_series_patch->'recurrence_lines',
      timezone = coalesce(nullif(p_series_patch->>'timezone', ''), timezone),
      revision = v_new_revision,
      status = 'active',
      deleted_at = null,
      purge_after = null
  where id = v_root.id;

  update public.event_series
  set status = 'deleted',
      deleted_at = now(),
      purge_after = now() + interval '30 days',
      revision = revision + 1
  where id = any(v_child_ids);

  update public.events
  set deleted_at = now(),
      purge_after = now() + interval '30 days'
  where id in (
    select template_event_id from public.event_series where id = any(v_child_ids)
  );

  update public.calendar_sync_operations
  set status = 'cancelled',
      completed_at = now(),
      last_error = 'Superseded by linked-family consolidation.'
  where series_id = any(v_family_ids)
    and status in ('pending', 'retrying');

  select coalesce((value->>'google_sync_v2')::boolean, false)
  into v_google_sync_enabled
  from public.settings where key = 'recurrence_v2_flags';
  if v_google_sync_enabled and v_root.source_connection_id is not null then
    insert into public.calendar_sync_operations (
      action_id, operation_key, series_id, connection_id, operation_type,
      casa_revision, payload_snapshot, correlation_id
    ) values (
      p_action_id, 'family:all:update', v_root.id, v_root.source_connection_id,
      'recreate_projection', v_new_revision,
      jsonb_build_object(
        'scope', 'all',
        'mutation_type', 'update',
        'changed_paths', to_jsonb(p_changed_paths),
        'obsolete_google_master_ids', to_jsonb(v_obsolete_google_ids)
      ),
      p_correlation_id
    ) returning id into v_operation_id;
  end if;

  insert into public.recurrence_mutation_history (
    action_id, series_id, selected_event_id, scope, mutation_type,
    expected_series_revision, applied_series_revision, actor, correlation_id,
    request_payload, before_state, after_state, status
  ) values (
    p_action_id, v_root.id, p_selected_event_id, 'all', 'update',
    p_expected_series_revision, v_new_revision, p_actor, p_correlation_id,
    jsonb_build_object(
      'changed_paths', to_jsonb(p_changed_paths),
      'detail_patch', p_detail_patch,
      'series_patch', p_series_patch,
      'family_series_ids', to_jsonb(v_family_ids)
    ),
    jsonb_build_object('selected_series_id', v_selected_series.id, 'family_series_ids', to_jsonb(v_family_ids)),
    jsonb_build_object(
      'series_id', v_root.id,
      'collapsed_series_ids', to_jsonb(v_child_ids),
      'series_revision', v_new_revision,
      'affected_occurrences', v_affected,
      'google_sync_status', case when v_operation_id is null then 'not_enabled' else 'pending' end
    ),
    'applied'
  ) returning * into v_existing;

  return jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'history_id', v_existing.id,
    'series_id', v_root.id,
    'series_revision', v_new_revision,
    'affected_occurrences', v_affected,
    'google_sync_status', case when v_operation_id is null then 'not_enabled' else 'pending' end
  );
end;
$function$;

-- update_updated_at: production definition as of 2026-09-25
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- upsert_event_bundle: production definition as of 2026-09-25
CREATE OR REPLACE FUNCTION public.upsert_event_bundle(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
  v_event jsonb := p_payload->'event';
  v_members jsonb := p_payload->'members';
  v_enrichment jsonb := p_payload->'enrichment';
  v_override jsonb := p_payload->'plan_override';
  v_place jsonb := p_payload->'saved_place';
  v_created_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_event is null or jsonb_typeof(v_event) <> 'object' then
    raise exception 'Missing required event data';
  end if;
  if nullif(btrim(v_event->>'title'), '') is null then
    raise exception 'Event title is required';
  end if;

  v_event_id := coalesce(nullif(p_payload->>'id', '')::uuid, gen_random_uuid());

  if v_place is not null and nullif(btrim(v_place->>'name'), '') is not null then
    begin
      insert into public.saved_places (
        name, aliases, address, city, state, zip, lat, lng,
        category, confirmed, source, occurrence_count
      ) values (
        btrim(v_place->>'name'),
        '{}',
        nullif(v_place->>'address', ''),
        nullif(v_place->>'city', ''),
        nullif(v_place->>'state', ''),
        nullif(v_place->>'zip', ''),
        nullif(v_place->>'lat', '')::numeric,
        nullif(v_place->>'lng', '')::numeric,
        coalesce(nullif(v_place->>'category', ''), 'other'),
        true,
        'manual',
        1
      );
    exception when others then
      raise warning 'upsert_event_bundle: saved_places insert skipped: %', sqlerrm;
    end;
  end if;

  insert into public.events (
    id, title, description, start_time, end_time, all_day, event_type,
    location_name, address, lat, lng, status, is_enriched, record_kind, is_exception
  ) values (
    v_event_id,
    btrim(v_event->>'title'),
    nullif(v_event->>'description', ''),
    (v_event->>'start_time')::timestamptz,
    (v_event->>'end_time')::timestamptz,
    coalesce((v_event->>'all_day')::boolean, false),
    coalesce(nullif(v_event->>'event_type', ''), 'event'),
    nullif(v_event->>'location_name', ''),
    nullif(v_event->>'address', ''),
    nullif(v_event->>'lat', '')::double precision,
    nullif(v_event->>'lng', '')::double precision,
    coalesce(nullif(v_event->>'status', ''), 'confirmed')::public.event_status,
    coalesce((v_event->>'is_enriched')::boolean, false),
    coalesce(nullif(v_event->>'record_kind', ''), 'single'),
    coalesce((v_event->>'is_exception')::boolean, false)
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    all_day = excluded.all_day,
    event_type = excluded.event_type,
    location_name = excluded.location_name,
    address = excluded.address,
    lat = case when v_event ? 'lat' then excluded.lat else public.events.lat end,
    lng = case when v_event ? 'lng' then excluded.lng else public.events.lng end,
    status = excluded.status,
    is_enriched = excluded.is_enriched,
    updated_at = now()
  returning created_at, updated_at into v_created_at, v_updated_at;

  if v_members is not null and jsonb_typeof(v_members) = 'array' and jsonb_array_length(v_members) > 0 then
    insert into public.event_members (event_id, family_member_id, role, rsvp_status)
    select distinct on (fid) v_event_id, fid,
           coalesce(nullif(m->>'role', ''), 'attendee'),
           coalesce(nullif(m->>'rsvp_status', ''), 'accepted')
    from (
      select (m->>'family_member_id')::uuid as fid, m
      from jsonb_array_elements(v_members) as m
      where nullif(m->>'family_member_id', '') is not null
    ) s
    order by fid
    on conflict (event_id, family_member_id) do update set
      role = excluded.role,
      rsvp_status = excluded.rsvp_status;

    delete from public.event_members em
    where em.event_id = v_event_id
      and em.family_member_id not in (
        select (m->>'family_member_id')::uuid
        from jsonb_array_elements(v_members) as m
        where nullif(m->>'family_member_id', '') is not null
      );
  end if;

  if v_enrichment is not null and jsonb_typeof(v_enrichment) = 'object' then
    insert into public.event_enrichments (event_id, category, category_locked, departure_time, drive_time_mins)
    values (
      v_event_id,
      nullif(v_enrichment->>'category', ''),
      coalesce((v_enrichment->>'category_locked')::boolean, false),
      nullif(v_enrichment->>'departure_time', '')::timestamptz,
      nullif(v_enrichment->>'drive_time_mins', '')::integer
    )
    on conflict (event_id) do update set
      category = coalesce(excluded.category, public.event_enrichments.category),
      category_locked = excluded.category_locked,
      departure_time = coalesce(excluded.departure_time, public.event_enrichments.departure_time),
      drive_time_mins = coalesce(excluded.drive_time_mins, public.event_enrichments.drive_time_mins);
  end if;

  if v_override is not null and jsonb_typeof(v_override) = 'object' then
    insert into public.event_plan_overrides (
      event_id, verified, waits, driver_overrides, mode_override,
      two_driver_confirmed, transportation_plan
    ) values (
      v_event_id,
      coalesce((v_override->>'verified')::boolean, false),
      coalesce((v_override->>'waits')::boolean, false),
      coalesce(v_override->'driver_overrides', '{}'::jsonb),
      v_override->>'mode_override',
      coalesce((v_override->>'two_driver_confirmed')::boolean, false),
      v_override->'transportation_plan'
    )
    on conflict (event_id) do update set
      verified = excluded.verified,
      waits = excluded.waits,
      driver_overrides = coalesce(excluded.driver_overrides, public.event_plan_overrides.driver_overrides),
      mode_override = coalesce(excluded.mode_override, public.event_plan_overrides.mode_override),
      two_driver_confirmed = excluded.two_driver_confirmed,
      transportation_plan = coalesce(excluded.transportation_plan, public.event_plan_overrides.transportation_plan);
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'created_at', v_created_at,
    'updated_at', v_updated_at
  );
end;
$function$;

-- upsert_todo_reminder_from_ios: production definition as of 2026-09-25
CREATE OR REPLACE FUNCTION public.upsert_todo_reminder_from_ios(p_ios_reminder_id text, p_title text, p_completed boolean, p_deleted boolean, p_ios_updated_at timestamp with time zone, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_due_has_time boolean DEFAULT true)
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


-- 2. sensor_readings columns added by hand in production ----------------------
alter table public.sensor_readings
  add column if not exists cct double precision,
  add column if not exists zone text,
  add column if not exists brightness integer,
  add column if not exists rgb integer[],
  add column if not exists updated_at timestamp with time zone default now();

-- 3. Indexes created by hand in production -----------------------------------
create index if not exists idx_event_series_parent_series ON public.event_series USING btree (parent_series_id) WHERE (parent_series_id IS NOT NULL);
create index if not exists idx_gmail_processed_created_event ON public.gmail_processed_messages USING btree (created_event_id) WHERE (created_event_id IS NOT NULL);
create index if not exists idx_notifications_event_id ON public.notifications USING btree (event_id) WHERE (event_id IS NOT NULL);
create index if not exists idx_prep_item_resolutions_event_id ON public.prep_item_resolutions USING btree (event_id) WHERE (event_id IS NOT NULL);
create index if not exists idx_prep_items_source_type_ref ON public.prep_items USING btree (source_type, source_ref);
create index if not exists idx_trips_event_id ON public.trips USING btree (event_id) WHERE (event_id IS NOT NULL);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'household_capture_rules_pattern_type_pattern_value_key'
  ) then
    alter table public.household_capture_rules
      add constraint household_capture_rules_pattern_type_pattern_value_key unique (pattern_type, pattern_value);
  end if;
end;
$$;

-- 4. Objects removed by hand in production ----------------------------------
drop index if exists public.member_availability_rules_member_idx;
alter table public.ai_drawer_debug_events drop constraint if exists ai_drawer_debug_events_channel_check;
drop view if exists public.ai_forensics_timeline;
drop view if exists public.ai_trace_integrity_violations;
