alter function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) rename to recurrence_apply_segment_mutation_core;

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
      p_expected_series_revision, v_selected_series.revision
      using errcode = 'P0001', detail = 'RECURRENCE_REVISION_CONFLICT';
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
$$;

revoke all on function public.recurrence_apply_segment_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.recurrence_apply_segment_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) to service_role;
revoke all on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) to service_role;
