alter table public.event_series
  add column if not exists parent_series_id uuid references public.event_series(id) on delete set null,
  add column if not exists split_occurrence_key text;

create unique index if not exists event_checklist_items_event_template_key_unique
  on public.event_checklist_items (event_id, template_item_key);

create unique index if not exists event_action_items_event_template_key_unique
  on public.event_action_items (event_id, template_item_key);

create unique index if not exists event_logistics_event_template_key_unique
  on public.event_logistics (event_id, template_item_key);

create or replace function public.recurrence_build_event_snapshot(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'members', coalesce((
      select jsonb_agg(to_jsonb(em) order by em.role, em.family_member_id)
      from public.event_members em where em.event_id = e.id
    ), '[]'::jsonb),
    'enrichment', (
      select to_jsonb(enr) from public.event_enrichments enr where enr.event_id = e.id limit 1
    ),
    'plan_override', (
      select to_jsonb(po) from public.event_plan_overrides po where po.event_id = e.id
    ),
    'logistics', coalesce((
      select jsonb_agg(to_jsonb(el) order by el.sort_order, el.id)
      from public.event_logistics el where el.event_id = e.id
    ), '[]'::jsonb),
    'checklist_items', coalesce((
      select jsonb_agg(to_jsonb(ci) order by ci.sort_order, ci.id)
      from public.event_checklist_items ci where ci.event_id = e.id
    ), '[]'::jsonb),
    'action_items', coalesce((
      select jsonb_agg(to_jsonb(ai) order by ai.created_at, ai.id)
      from public.event_action_items ai where ai.event_id = e.id
    ), '[]'::jsonb)
  )
  from public.events e
  where e.id = p_event_id;
$$;

create or replace function public.recurrence_build_reusable_patch(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot as (
    select public.recurrence_build_event_snapshot(p_event_id) value
  )
  select jsonb_build_object(
    'event', value->'event',
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family_member_id', member->>'family_member_id',
        'role', member->>'role'
      ))
      from jsonb_array_elements(value->'members') member
    ), '[]'::jsonb),
    'enrichment', value->'enrichment',
    'transportation_plan', value#>'{plan_override,transportation_plan}',
    'logistics', value->'logistics',
    'checklist_definitions', coalesce((
      select jsonb_agg(item - 'id' - 'event_id' - 'checked' - 'created_at')
      from jsonb_array_elements(value->'checklist_items') item
    ), '[]'::jsonb),
    'action_definitions', coalesce((
      select jsonb_agg(item - 'id' - 'event_id' - 'due_date' - 'completed' - 'completed_at' - 'created_at')
      from jsonb_array_elements(value->'action_items') item
    ), '[]'::jsonb)
  )
  from snapshot;
$$;

create or replace function public.recurrence_path_is_inherited(
  p_exception_paths jsonb,
  p_path text
)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_exception_paths, '[]'::jsonb)) exception_path
    where exception_path = p_path
       or exception_path like p_path || '.%'
       or p_path like exception_path || '.%'
  );
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
  ) and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.schedule'));
  v_can_all_day := 'event.allDay' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.allDay'));
  v_can_type := 'event.eventType' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.eventType'));
  v_can_location := (
    'event.locationName' = any(p_changed_paths)
    or 'event.address' = any(p_changed_paths)
    or 'event.lat' = any(p_changed_paths)
    or 'event.lng' = any(p_changed_paths)
  ) and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'event.location'));

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
      when v_can_schedule and p_patch ? 'end_time' then (p_patch->>'end_time')::timestamptz
      when v_can_schedule and p_patch ? 'duration_ms' then start_time + ((p_patch->>'duration_ms')::bigint * interval '1 millisecond')
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

create or replace function public.recurrence_apply_reusable_graph(
  p_event_id uuid,
  p_detail_patch jsonb,
  p_changed_paths text[],
  p_respect_exceptions boolean,
  p_series_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_item jsonb;
  v_key uuid;
  v_existing_checked boolean;
  v_existing_completed boolean;
  v_existing_completed_at timestamptz;
  v_existing_due_date date;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found: %', p_event_id; end if;

  perform public.recurrence_apply_event_patch(
    p_event_id,
    coalesce(p_detail_patch->'event', '{}'::jsonb),
    p_changed_paths,
    p_respect_exceptions,
    p_series_revision
  );

  if 'assignments' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'assignments'))
  then
    if jsonb_typeof(p_detail_patch->'assignments') <> 'array' then
      raise exception 'assignments must be an array';
    end if;
    delete from public.event_members
    where event_id = p_event_id
      and family_member_id not in (
        select (value->>'family_member_id')::uuid
        from jsonb_array_elements(p_detail_patch->'assignments')
      );
    insert into public.event_members (event_id, family_member_id, role, rsvp_status)
    select
      p_event_id,
      (value->>'family_member_id')::uuid,
      coalesce(nullif(value->>'role', ''), 'attendee'),
      coalesce((
        select existing.rsvp_status
        from public.event_members existing
        where existing.event_id = p_event_id
          and existing.family_member_id = (value->>'family_member_id')::uuid
      ), 'accepted')
    from jsonb_array_elements(p_detail_patch->'assignments')
    on conflict (event_id, family_member_id) do update set role = excluded.role;
  end if;

  if 'enrichment' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'enrichment'))
  then
    insert into public.event_enrichments (
      event_id, confidence, what_to_bring, prep_notes, category, category_locked,
      outfit_suggestion, parking_notes, contact_name, contact_phone, cost_estimate,
      dietary_notes, meal_impact, enriched_by, enriched_at, created_at, updated_at
    )
    values (
      p_event_id,
      coalesce(nullif(p_detail_patch#>>'{enrichment,confidence}', '')::public.enrichment_confidence, 'low'),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_detail_patch#>'{enrichment,what_to_bring}', '[]'::jsonb))), array[]::text[]),
      nullif(p_detail_patch#>>'{enrichment,prep_notes}', ''),
      nullif(p_detail_patch#>>'{enrichment,category}', ''),
      coalesce((p_detail_patch#>>'{enrichment,category_locked}')::boolean, false),
      nullif(p_detail_patch#>>'{enrichment,outfit_suggestion}', ''),
      nullif(p_detail_patch#>>'{enrichment,parking_notes}', ''),
      nullif(p_detail_patch#>>'{enrichment,contact_name}', ''),
      nullif(p_detail_patch#>>'{enrichment,contact_phone}', ''),
      nullif(p_detail_patch#>>'{enrichment,cost_estimate}', ''),
      nullif(p_detail_patch#>>'{enrichment,dietary_notes}', ''),
      nullif(p_detail_patch#>>'{enrichment,meal_impact}', ''),
      'recurrence-v2',
      now(), now(), now()
    )
    on conflict (event_id) do update set
      confidence = excluded.confidence,
      what_to_bring = excluded.what_to_bring,
      prep_notes = excluded.prep_notes,
      category = excluded.category,
      category_locked = excluded.category_locked,
      outfit_suggestion = excluded.outfit_suggestion,
      parking_notes = excluded.parking_notes,
      contact_name = excluded.contact_name,
      contact_phone = excluded.contact_phone,
      cost_estimate = excluded.cost_estimate,
      dietary_notes = excluded.dietary_notes,
      meal_impact = excluded.meal_impact,
      updated_at = now();
  end if;

  if 'transportationPlan' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'transportationPlan'))
  then
    insert into public.event_plan_overrides (event_id, transportation_plan)
    values (p_event_id, p_detail_patch->'transportation_plan')
    on conflict (event_id) do update
      set transportation_plan = excluded.transportation_plan;
  end if;

  if 'logistics' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'logistics'))
  then
    delete from public.event_logistics where event_id = p_event_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_detail_patch->'logistics', '[]'::jsonb))
    loop
      insert into public.event_logistics (
        event_id, sort_order, step_type, icon, title, description, time,
        location_name, address, template_item_key, template_revision
      ) values (
        p_event_id,
        coalesce((v_item->>'sort_order')::integer, 0),
        coalesce(nullif(v_item->>'step_type', ''), 'note'),
        nullif(v_item->>'icon', ''),
        v_item->>'title',
        nullif(v_item->>'description', ''),
        nullif(v_item->>'time', '')::timestamptz,
        nullif(v_item->>'location_name', ''),
        nullif(v_item->>'address', ''),
        coalesce(nullif(v_item->>'template_item_key', '')::uuid, gen_random_uuid()),
        p_series_revision
      );
    end loop;
  end if;

  if 'checklistDefinitions' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'checklistDefinitions'))
  then
    for v_item in select value from jsonb_array_elements(coalesce(p_detail_patch->'checklist_definitions', '[]'::jsonb))
    loop
      v_key := coalesce(nullif(v_item->>'template_item_key', '')::uuid, gen_random_uuid());
      select checked into v_existing_checked
      from public.event_checklist_items
      where event_id = p_event_id and template_item_key = v_key;
      insert into public.event_checklist_items (
        event_id, label, note, checked, category, sort_order, template_item_key, template_revision
      ) values (
        p_event_id,
        v_item->>'label',
        nullif(v_item->>'note', ''),
        coalesce(v_existing_checked, false),
        coalesce(nullif(v_item->>'category', ''), 'gear'),
        coalesce((v_item->>'sort_order')::integer, 0),
        v_key,
        p_series_revision
      )
      on conflict (event_id, template_item_key) do update set
        label = excluded.label,
        note = excluded.note,
        category = excluded.category,
        sort_order = excluded.sort_order,
        template_revision = excluded.template_revision;
    end loop;
    delete from public.event_checklist_items
    where event_id = p_event_id
      and template_item_key not in (
        select coalesce(nullif(value->>'template_item_key', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        from jsonb_array_elements(coalesce(p_detail_patch->'checklist_definitions', '[]'::jsonb))
      );
  end if;

  if 'actionDefinitions' = any(p_changed_paths)
    and (not p_respect_exceptions or public.recurrence_path_is_inherited(v_event.exception_paths, 'actionDefinitions'))
  then
    for v_item in select value from jsonb_array_elements(coalesce(p_detail_patch->'action_definitions', '[]'::jsonb))
    loop
      v_key := coalesce(nullif(v_item->>'template_item_key', '')::uuid, gen_random_uuid());
      select completed, completed_at, due_date
      into v_existing_completed, v_existing_completed_at, v_existing_due_date
      from public.event_action_items
      where event_id = p_event_id and template_item_key = v_key;
      if not found then
        insert into public.event_action_items (
          event_id, title, description, due_date, is_urgent, completed, completed_at,
          assigned_to, template_item_key, template_revision, template_due_offset_minutes
        ) values (
          p_event_id,
          v_item->>'title',
          nullif(v_item->>'description', ''),
          null,
          coalesce((v_item->>'is_urgent')::boolean, false),
          false,
          null,
          nullif(v_item->>'assigned_to', '')::uuid,
          v_key,
          p_series_revision,
          nullif(v_item->>'template_due_offset_minutes', '')::integer
        );
      else
        update public.event_action_items set
          title = v_item->>'title',
          description = nullif(v_item->>'description', ''),
          due_date = v_existing_due_date,
          is_urgent = coalesce((v_item->>'is_urgent')::boolean, false),
          completed = v_existing_completed,
          completed_at = v_existing_completed_at,
          assigned_to = nullif(v_item->>'assigned_to', '')::uuid,
          template_revision = p_series_revision,
          template_due_offset_minutes = nullif(v_item->>'template_due_offset_minutes', '')::integer
        where event_id = p_event_id and template_item_key = v_key;
      end if;
    end loop;
    delete from public.event_action_items
    where event_id = p_event_id
      and template_item_key not in (
        select coalesce(nullif(value->>'template_item_key', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        from jsonb_array_elements(coalesce(p_detail_patch->'action_definitions', '[]'::jsonb))
      );
  end if;
end;
$$;

create or replace function public.recurrence_clone_reusable_graph(
  p_source_event_id uuid,
  p_target_event_id uuid,
  p_series_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_members (event_id, family_member_id, role, rsvp_status)
  select p_target_event_id, family_member_id, role, 'accepted'
  from public.event_members where event_id = p_source_event_id;

  insert into public.event_enrichments (
    event_id, what_to_bring, prep_notes, outfit_suggestion, parking_notes, confidence,
    enriched_by, enriched_at, dietary_notes, cost_estimate, contact_name, contact_phone,
    meal_impact, category, category_locked, created_at, updated_at
  )
  select
    p_target_event_id, what_to_bring, prep_notes, outfit_suggestion, parking_notes, confidence,
    'recurrence-v2', now(), dietary_notes, cost_estimate, contact_name, contact_phone,
    meal_impact, category, category_locked, now(), now()
  from public.event_enrichments where event_id = p_source_event_id;

  insert into public.event_plan_overrides (
    event_id, verified, waits, driver_overrides, mode_override, two_driver_confirmed,
    location_signature, transportation_plan
  )
  select
    p_target_event_id, verified, waits, driver_overrides, mode_override,
    two_driver_confirmed, location_signature, transportation_plan
  from public.event_plan_overrides where event_id = p_source_event_id;

  insert into public.event_logistics (
    event_id, sort_order, step_type, icon, title, description, time, location_name,
    address, template_item_key, template_revision
  )
  select
    p_target_event_id, sort_order, step_type, icon, title, description, time,
    location_name, address, template_item_key, p_series_revision
  from public.event_logistics where event_id = p_source_event_id;

  insert into public.event_checklist_items (
    event_id, label, note, checked, category, sort_order, template_item_key, template_revision
  )
  select
    p_target_event_id, label, note, false, category, sort_order, template_item_key, p_series_revision
  from public.event_checklist_items where event_id = p_source_event_id;

  insert into public.event_action_items (
    event_id, title, description, due_date, is_urgent, completed, completed_at,
    assigned_to, template_item_key, template_revision, template_due_offset_minutes
  )
  select
    p_target_event_id, title, description, null, is_urgent, false, null,
    assigned_to, template_item_key, p_series_revision, template_due_offset_minutes
  from public.event_action_items where event_id = p_source_event_id;
end;
$$;

create or replace function public.recurrence_apply_scoped_mutation_core(
  p_action_id text,
  p_selected_event_id uuid,
  p_scope text,
  p_mutation_type text,
  p_expected_series_revision bigint,
  p_changed_paths text[] default array[]::text[],
  p_detail_patch jsonb default '{}'::jsonb,
  p_series_patch jsonb default '{}'::jsonb,
  p_actor jsonb default '{}'::jsonb,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.recurrence_mutation_history%rowtype;
  v_selected public.events%rowtype;
  v_series public.event_series%rowtype;
  v_template public.events%rowtype;
  v_new_template_id uuid;
  v_new_series_id uuid;
  v_new_revision bigint;
  v_event public.events%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
  v_purge_after timestamptz := now() + interval '30 days';
  v_connection_id uuid;
  v_google_sync_enabled boolean := false;
  v_operation_type text;
  v_affected integer := 0;
  v_reset_path text;
  v_changed_path text;
begin
  if nullif(btrim(p_action_id), '') is null then raise exception 'action_id is required'; end if;
  if p_scope not in ('this', 'future', 'all') then raise exception 'Unsupported recurrence scope: %', p_scope; end if;
  if p_mutation_type not in ('update', 'delete', 'restore', 'reset_exceptions') then
    raise exception 'Unsupported recurrence mutation type: %', p_mutation_type;
  end if;
  if nullif(btrim(p_correlation_id), '') is null then raise exception 'correlation_id is required'; end if;
  foreach v_changed_path in array p_changed_paths loop
    if v_changed_path not in (
      'event.title', 'event.description', 'event.startTime', 'event.endTime',
      'event.durationMs', 'event.allDay', 'event.eventType', 'event.locationName',
      'event.address', 'event.lat', 'event.lng', 'assignments', 'enrichment',
      'transportationPlan', 'logistics', 'checklistDefinitions', 'actionDefinitions',
      'googleInvitees'
    ) then
      raise exception 'Unsupported reusable detail path: %', v_changed_path;
    end if;
  end loop;

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

  select * into v_selected from public.events where id = p_selected_event_id for update;
  if not found or v_selected.series_id is null then raise exception 'Recurring occurrence not found'; end if;
  select * into v_series from public.event_series where id = v_selected.series_id for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if v_series.ownership = 'read_only_import' then raise exception 'Read-only recurring series must be adopted before editing'; end if;
  if p_expected_series_revision is distinct from v_series.revision then
    raise exception 'Recurring series changed: expected revision %, current revision %',
      p_expected_series_revision, v_series.revision using errcode = '40001';
  end if;
  select * into v_template from public.events where id = v_series.template_event_id for update;
  if not found then raise exception 'Recurring series template not found'; end if;

  v_before := jsonb_build_object(
    'series', to_jsonb(v_series),
    'template', public.recurrence_build_event_snapshot(v_template.id),
    'selected_occurrence', public.recurrence_build_event_snapshot(v_selected.id)
  );
  v_new_revision := v_series.revision + 1;

  if p_mutation_type = 'update' then
    if p_scope = 'this' then
      perform public.recurrence_apply_reusable_graph(
        v_selected.id, p_detail_patch, p_changed_paths, false, v_new_revision
      );
      update public.events set
        is_exception = true,
        exception_paths = (
          select coalesce(jsonb_agg(distinct path order by path), '[]'::jsonb)
          from (
            select jsonb_array_elements_text(exception_paths) path
            union all select unnest(p_changed_paths)
          ) paths
        ),
        series_revision_applied = v_new_revision
      where id = v_selected.id;
      v_affected := 1;
      v_operation_type := 'patch_instance';
    elsif p_scope = 'all' then
      perform public.recurrence_apply_reusable_graph(
        v_template.id, p_detail_patch, p_changed_paths, false, v_new_revision
      );
      for v_event in
        select * from public.events
        where series_id = v_series.id and deleted_at is null
        order by original_start_time nulls last, original_start_date nulls last
        for update
      loop
        perform public.recurrence_apply_reusable_graph(
          v_event.id, p_detail_patch, p_changed_paths, true, v_new_revision
        );
        v_affected := v_affected + 1;
      end loop;
      update public.event_series set
        timezone = coalesce(nullif(p_series_patch->>'timezone', ''), timezone),
        recurrence_lines = case when p_series_patch ? 'recurrence_lines'
          then p_series_patch->'recurrence_lines' else recurrence_lines end,
        revision = v_new_revision
      where id = v_series.id;
      v_operation_type := 'patch_master';
    else
      if jsonb_typeof(p_series_patch->'original_recurrence_lines') <> 'array'
        or jsonb_typeof(p_series_patch->'future_recurrence_lines') <> 'array'
      then
        raise exception 'Future updates require original_recurrence_lines and future_recurrence_lines';
      end if;
      insert into public.events (
        title, description, start_time, end_time, all_day, event_type, location_name,
        address, lat, lng, google_calendar_id, source_member_id, status, is_enriched,
        record_kind, series_revision_applied
      ) values (
        v_template.title, v_template.description, v_selected.start_time, v_selected.end_time,
        v_template.all_day, v_template.event_type, v_template.location_name, v_template.address,
        v_template.lat, v_template.lng, v_template.google_calendar_id, v_template.source_member_id,
        v_template.status, true, 'series_template', 1
      ) returning id into v_new_template_id;
      perform public.recurrence_clone_reusable_graph(v_template.id, v_new_template_id, 1);

      insert into public.event_series (
        template_event_id, timezone, recurrence_lines, status, revision, ownership,
        source_connection_id, google_calendar_id, parent_series_id, split_occurrence_key
      ) values (
        v_new_template_id,
        coalesce(nullif(p_series_patch->>'timezone', ''), v_series.timezone),
        p_series_patch->'future_recurrence_lines',
        'active', 1, v_series.ownership, v_series.source_connection_id,
        v_series.google_calendar_id, v_series.id, v_selected.occurrence_key
      ) returning id into v_new_series_id;
      update public.events set
        series_id = v_new_series_id,
        series_revision_applied = 1
      where series_id = v_series.id
        and (
          (v_selected.original_start_time is not null and original_start_time >= v_selected.original_start_time)
          or (v_selected.original_start_date is not null and original_start_date >= v_selected.original_start_date)
        );
      perform public.recurrence_apply_reusable_graph(
        v_new_template_id, p_detail_patch, p_changed_paths, false, 2
      );
      for v_event in select * from public.events where series_id = v_new_series_id and deleted_at is null for update
      loop
        perform public.recurrence_apply_reusable_graph(
          v_event.id, p_detail_patch, p_changed_paths, true, 2
        );
        v_affected := v_affected + 1;
      end loop;
      update public.event_series set revision = v_new_revision,
        recurrence_lines = p_series_patch->'original_recurrence_lines'
      where id = v_series.id;
      update public.event_series set revision = 2 where id = v_new_series_id;
      v_operation_type := 'split_series';
    end if;
  elsif p_mutation_type in ('delete', 'restore') then
    if p_mutation_type = 'delete' then
      if p_scope = 'this' then
        update public.events set deleted_at = v_now, purge_after = v_purge_after, updated_at = v_now
        where id = v_selected.id;
        v_affected := 1;
        v_operation_type := 'cancel_instance';
      elsif p_scope = 'all' then
        update public.event_series set status = 'deleted', deleted_at = v_now,
          purge_after = v_purge_after, revision = v_new_revision where id = v_series.id;
        update public.events set deleted_at = v_now, purge_after = v_purge_after, updated_at = v_now
        where id = v_template.id or series_id = v_series.id;
        get diagnostics v_affected = row_count;
        v_operation_type := 'delete_master';
      else
        update public.event_series set
          recurrence_lines = p_series_patch->'original_recurrence_lines',
          revision = v_new_revision
        where id = v_series.id;
        update public.events set deleted_at = v_now, purge_after = v_purge_after, updated_at = v_now
        where series_id = v_series.id
          and (
            (v_selected.original_start_time is not null and original_start_time >= v_selected.original_start_time)
            or (v_selected.original_start_date is not null and original_start_date >= v_selected.original_start_date)
          );
        get diagnostics v_affected = row_count;
        v_operation_type := 'patch_master';
      end if;
    else
      if p_scope = 'this' then
        update public.events set deleted_at = null, purge_after = null, updated_at = v_now
        where id = v_selected.id;
        v_affected := 1;
        v_operation_type := 'restore_instance';
      else
        update public.event_series set status = 'active', deleted_at = null,
          purge_after = null, revision = v_new_revision where id = v_series.id;
        update public.events set deleted_at = null, purge_after = null, updated_at = v_now
        where id = v_template.id or (
          series_id = v_series.id and (
            p_scope = 'all'
            or (v_selected.original_start_time is not null and original_start_time >= v_selected.original_start_time)
            or (v_selected.original_start_date is not null and original_start_date >= v_selected.original_start_date)
          )
        );
        get diagnostics v_affected = row_count;
        v_operation_type := case when p_scope = 'all' then 'recreate_projection' else 'patch_master' end;
      end if;
    end if;
  else
    if coalesce(array_length(p_changed_paths, 1), 0) = 0 then
      raise exception 'Reset exceptions requires at least one changed path';
    end if;
    for v_event in
      select * from public.events
      where series_id = v_series.id
        and (p_scope = 'all' or id = v_selected.id or (
          p_scope = 'future' and (
            (v_selected.original_start_time is not null and original_start_time >= v_selected.original_start_time)
            or (v_selected.original_start_date is not null and original_start_date >= v_selected.original_start_date)
          )
        ))
      for update
    loop
      foreach v_reset_path in array p_changed_paths loop
        update public.events set exception_paths = (
          select coalesce(jsonb_agg(path order by path), '[]'::jsonb)
          from jsonb_array_elements_text(exception_paths) path
          where path <> v_reset_path
            and path not like v_reset_path || '.%'
            and v_reset_path not like path || '.%'
        ) where id = v_event.id;
      end loop;
      update public.events set
        is_exception = jsonb_array_length(exception_paths) > 0,
        series_revision_applied = v_new_revision
      where id = v_event.id;
      perform public.recurrence_apply_reusable_graph(
        v_event.id, public.recurrence_build_reusable_patch(v_template.id),
        p_changed_paths, false, v_new_revision
      );
      v_affected := v_affected + 1;
    end loop;
    v_operation_type := case when p_scope = 'this' then 'patch_instance' else 'patch_master' end;
  end if;

  if p_scope = 'this' and p_mutation_type in ('update', 'delete', 'restore', 'reset_exceptions') then
    update public.event_series set revision = v_new_revision where id = v_series.id;
  end if;

  select source_connection_id into v_connection_id
  from public.event_series where id = coalesce(v_new_series_id, v_series.id);
  select coalesce((value->>'google_sync_v2')::boolean, false)
  into v_google_sync_enabled
  from public.settings where key = 'recurrence_v2_flags';

  if v_google_sync_enabled and v_connection_id is not null then
    insert into public.calendar_sync_operations (
      action_id, operation_key, series_id, event_id, connection_id, operation_type,
      casa_revision, payload_snapshot, correlation_id
    ) values (
      p_action_id, p_scope || ':' || p_mutation_type,
      coalesce(v_new_series_id, v_series.id),
      case when p_scope = 'this' then v_selected.id else null end,
      v_connection_id, v_operation_type,
      case when v_new_series_id is not null then 2 else v_new_revision end,
      jsonb_build_object('scope', p_scope, 'mutation_type', p_mutation_type),
      p_correlation_id
    ) on conflict (action_id, operation_key) do nothing;
  end if;

  v_after := jsonb_build_object(
    'series_id', v_series.id,
    'future_series_id', v_new_series_id,
    'series_revision', v_new_revision,
    'affected_occurrences', v_affected,
    'google_sync_status', case when v_google_sync_enabled and v_connection_id is not null then 'pending' else 'not_enabled' end
  );
  insert into public.recurrence_mutation_history (
    action_id, series_id, selected_event_id, scope, mutation_type,
    expected_series_revision, applied_series_revision, actor, correlation_id,
    request_payload, before_state, after_state, status
  ) values (
    p_action_id, v_series.id, v_selected.id, p_scope, p_mutation_type,
    p_expected_series_revision, v_new_revision, p_actor, p_correlation_id,
    jsonb_build_object(
      'changed_paths', to_jsonb(p_changed_paths),
      'detail_patch', p_detail_patch,
      'series_patch', p_series_patch
    ),
    v_before, v_after, 'applied'
  ) returning id into v_existing.id;

  return jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'history_id', v_existing.id,
    'series_id', v_series.id,
    'future_series_id', v_new_series_id,
    'series_revision', v_new_revision,
    'affected_occurrences', v_affected,
    'google_sync_status', v_after->>'google_sync_status'
  );
end;
$$;

revoke all on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) to service_role;

create or replace function public.mutate_recurring_event(
  p_action_id text,
  p_selected_event_id uuid,
  p_scope text,
  p_mutation_type text,
  p_expected_series_revision bigint,
  p_changed_paths text[] default array[]::text[],
  p_detail_patch jsonb default '{}'::jsonb,
  p_series_patch jsonb default '{}'::jsonb,
  p_actor jsonb default '{}'::jsonb,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
begin
  select coalesce((value->>'recurrence_v2_write')::boolean, false)
  into v_enabled
  from public.settings where key = 'recurrence_v2_flags';
  if not v_enabled then raise exception 'Recurring event v2 writes are disabled'; end if;
  return public.recurrence_apply_scoped_mutation_core(
    p_action_id, p_selected_event_id, p_scope, p_mutation_type,
    p_expected_series_revision, p_changed_paths, p_detail_patch,
    p_series_patch, p_actor, p_correlation_id
  );
end;
$$;
