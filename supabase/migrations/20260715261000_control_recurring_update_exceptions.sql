alter function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) rename to recurrence_apply_scoped_mutation_without_exception_policy_core;

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
  v_preserve_exceptions boolean := coalesce((p_series_patch->>'preserve_exceptions')::boolean, true);
  v_snapshots jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_result jsonb;
  v_retained_paths text[];
  v_replaced_paths text[];
  v_event public.events%rowtype;
  v_series public.event_series%rowtype;
  v_existing public.recurrence_mutation_history%rowtype;
  v_google_sync_enabled boolean := false;
  v_has_recreate_operation boolean := false;
  v_revision bigint;
begin
  select * into v_existing
  from public.recurrence_mutation_history
  where action_id = p_action_id;
  if found then
    return public.recurrence_apply_scoped_mutation_without_exception_policy_core(
      p_action_id,
      p_selected_event_id,
      p_scope,
      p_mutation_type,
      p_expected_series_revision,
      p_changed_paths,
      p_detail_patch,
      p_series_patch - 'preserve_exceptions',
      p_actor,
      p_correlation_id
    );
  end if;

  select * into v_selected from public.events where id = p_selected_event_id;
  if not found then raise exception 'Recurring occurrence not found'; end if;

  if p_mutation_type = 'update'
    and p_scope in ('future', 'all')
    and coalesce(array_length(p_changed_paths, 1), 0) > 0
  then
    if p_scope = 'all' then
      with recursive ancestors as (
        select series.*
        from public.event_series series
        where series.id = v_selected.series_id
        union all
        select parent.*
        from public.event_series parent
        join ancestors child on child.parent_series_id = parent.id
      ),
      root as (
        select id from ancestors where parent_series_id is null limit 1
      ),
      family as (
        select series.id
        from public.event_series series
        join root on series.id = root.id
        union all
        select child.id
        from public.event_series child
        join family parent on child.parent_series_id = parent.id
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_id', event.id,
        'exception_paths', event.exception_paths,
        'patch', public.recurrence_build_reusable_patch(event.id)
      )), '[]'::jsonb)
      into v_snapshots
      from public.events event
      where event.series_id in (select id from family)
        and event.deleted_at is null
        and jsonb_array_length(event.exception_paths) > 0;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_id', event.id,
        'exception_paths', event.exception_paths,
        'patch', public.recurrence_build_reusable_patch(event.id)
      )), '[]'::jsonb)
      into v_snapshots
      from public.events event
      where event.series_id = v_selected.series_id
        and event.deleted_at is null
        and jsonb_array_length(event.exception_paths) > 0
        and (
          (v_selected.original_start_time is not null
            and event.original_start_time >= v_selected.original_start_time)
          or (v_selected.original_start_date is not null
            and event.original_start_date >= v_selected.original_start_date)
        );
    end if;
  end if;

  v_result := public.recurrence_apply_scoped_mutation_without_exception_policy_core(
    p_action_id,
    p_selected_event_id,
    p_scope,
    p_mutation_type,
    p_expected_series_revision,
    p_changed_paths,
    p_detail_patch,
    p_series_patch - 'preserve_exceptions',
    p_actor,
    p_correlation_id
  );
  v_revision := nullif(v_result->>'series_revision', '')::bigint;

  for v_snapshot in select value from jsonb_array_elements(v_snapshots)
  loop
    select coalesce(array_agg(path order by path), array[]::text[])
    into v_retained_paths
    from jsonb_array_elements_text(v_snapshot->'exception_paths') path
    where v_preserve_exceptions
       or not exists (
         select 1
         from unnest(p_changed_paths) changed_path
         where path = changed_path
            or path like changed_path || '.%'
            or changed_path like path || '.%'
       );

    select coalesce(array_agg(path order by path), array[]::text[])
    into v_replaced_paths
    from jsonb_array_elements_text(v_snapshot->'exception_paths') path
    where not v_preserve_exceptions
      and exists (
        select 1
        from unnest(p_changed_paths) changed_path
        where path = changed_path
           or path like changed_path || '.%'
           or changed_path like path || '.%'
      );

    select * into v_event
    from public.events
    where id = (v_snapshot->>'event_id')::uuid
      and deleted_at is null
    for update;
    if not found then continue; end if;

    update public.events
    set exception_paths = to_jsonb(v_retained_paths),
        is_exception = cardinality(v_retained_paths) > 0,
        series_revision_applied = coalesce(v_revision, series_revision_applied)
    where id = v_event.id;

    if cardinality(v_retained_paths) > 0 then
      perform public.recurrence_apply_reusable_graph(
        v_event.id,
        v_snapshot->'patch',
        v_retained_paths,
        false,
        v_revision
      );
    end if;

    if cardinality(v_replaced_paths) > 0 then
      perform public.recurrence_apply_reusable_graph(
        v_event.id,
        p_detail_patch,
        p_changed_paths,
        false,
        v_revision
      );
    end if;
  end loop;

  update public.recurrence_mutation_history
  set request_payload = request_payload || jsonb_build_object(
    'preserve_exceptions', v_preserve_exceptions
  )
  where action_id = p_action_id;

  if not v_preserve_exceptions and jsonb_array_length(v_snapshots) > 0 then
    select exists (
      select 1
      from public.calendar_sync_operations operation
      where operation.action_id = p_action_id
        and operation.operation_type = 'recreate_projection'
    ) into v_has_recreate_operation;

    select coalesce((value->>'google_sync_v2')::boolean, false)
    into v_google_sync_enabled
    from public.settings
    where key = 'recurrence_v2_flags';

    if v_google_sync_enabled and not v_has_recreate_operation then
      for v_event in
        select event.*
        from public.events event
        where event.id in (
          select (snapshot->>'event_id')::uuid
          from jsonb_array_elements(v_snapshots) snapshot
        )
          and event.deleted_at is null
          and event.google_event_id is not null
      loop
        select * into v_series from public.event_series where id = v_event.series_id;
        if v_series.source_connection_id is null then continue; end if;
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
        ) values (
          p_action_id,
          'exception:' || v_event.id::text || ':update',
          v_event.series_id,
          v_event.id,
          v_series.source_connection_id,
          'patch_instance',
          v_series.revision,
          jsonb_build_object(
            'scope', p_scope,
            'mutation_type', p_mutation_type,
            'changed_paths', to_jsonb(p_changed_paths),
            'exception_policy', 'replace'
          ),
          p_correlation_id
        ) on conflict (action_id, operation_key) do nothing;
      end loop;
    end if;
  end if;

  return jsonb_set(
    v_result,
    '{exception_policy}',
    to_jsonb(case when v_preserve_exceptions then 'preserve' else 'replace' end),
    true
  );
end;
$$;

revoke all on function public.recurrence_apply_scoped_mutation_without_exception_policy_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) from public, anon, authenticated;

revoke all on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) to service_role;
