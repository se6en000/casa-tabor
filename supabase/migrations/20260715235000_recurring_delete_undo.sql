alter table public.recurrence_mutation_history
  add column if not exists reverted_history_id uuid references public.recurrence_mutation_history(id) on delete set null,
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by_history_id uuid references public.recurrence_mutation_history(id) on delete set null;

create or replace function public.recurrence_delete_scoped_core(
  p_action_id text,
  p_selected_event_id uuid,
  p_scope text,
  p_expected_series_revision bigint,
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
  v_now timestamptz := now();
  v_undo_until timestamptz := now() + interval '30 days';
  v_new_revision bigint;
  v_affected_ids uuid[] := array[]::uuid[];
  v_connection_id uuid;
  v_google_sync_enabled boolean := false;
  v_operation_type text;
  v_after jsonb;
begin
  if nullif(btrim(p_action_id), '') is null then raise exception 'action_id is required'; end if;
  if p_scope not in ('this', 'future', 'all') then raise exception 'Unsupported recurrence scope: %', p_scope; end if;
  if nullif(btrim(p_correlation_id), '') is null then raise exception 'correlation_id is required'; end if;

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
      'affected_occurrences', coalesce((v_existing.after_state->>'affected_occurrences')::integer, 0),
      'undo_until', v_existing.after_state->>'undo_until',
      'google_sync_status', v_existing.after_state->>'google_sync_status'
    );
  end if;

  select * into v_selected
  from public.events
  where id = p_selected_event_id
  for update;
  if not found or v_selected.series_id is null or v_selected.record_kind <> 'occurrence' then
    raise exception 'Recurring occurrence not found';
  end if;
  if v_selected.deleted_at is not null then raise exception 'This recurring event is already deleted'; end if;

  select * into v_series
  from public.event_series
  where id = v_selected.series_id
  for update;
  if not found then raise exception 'Recurring series not found'; end if;
  if v_series.ownership = 'read_only_import' then
    raise exception 'Read-only recurring series must be adopted before deleting';
  end if;
  if v_series.status <> 'active' then raise exception 'Recurring series is already deleted'; end if;
  if p_expected_series_revision is distinct from v_series.revision then
    raise exception 'Recurring series changed: expected revision %, current revision %',
      p_expected_series_revision, v_series.revision;
  end if;

  select * into v_template
  from public.events
  where id = v_series.template_event_id
  for update;
  if not found then raise exception 'Recurring series template not found'; end if;

  v_new_revision := v_series.revision + 1;
  if p_scope = 'this' then
    v_affected_ids := array[v_selected.id];
    update public.events
    set deleted_at = v_now,
        purge_after = v_undo_until,
        tombstone_origin = 'user',
        series_revision_applied = v_new_revision,
        updated_at = v_now
    where id = v_selected.id;
    update public.event_series
    set revision = v_new_revision, updated_at = v_now
    where id = v_series.id;
    v_operation_type := 'cancel_instance';
  elsif p_scope = 'future' then
    if jsonb_typeof(p_series_patch->'original_recurrence_lines') <> 'array' then
      raise exception 'Future deletion requires original_recurrence_lines';
    end if;
    select coalesce(array_agg(id order by start_time), array[]::uuid[])
    into v_affected_ids
    from public.events
    where series_id = v_series.id
      and deleted_at is null
      and (
        (v_selected.original_start_time is not null and original_start_time >= v_selected.original_start_time)
        or (v_selected.original_start_date is not null and original_start_date >= v_selected.original_start_date)
      );
    if coalesce(array_length(v_affected_ids, 1), 0) = 0 then
      raise exception 'No active recurring events matched this and following';
    end if;
    update public.events
    set deleted_at = v_now,
        purge_after = v_undo_until,
        tombstone_origin = 'user',
        series_revision_applied = v_new_revision,
        updated_at = v_now
    where id = any(v_affected_ids);
    update public.event_series
    set recurrence_lines = p_series_patch->'original_recurrence_lines',
        revision = v_new_revision,
        updated_at = v_now
    where id = v_series.id;
    v_operation_type := 'patch_master';
  else
    select coalesce(array_agg(id order by start_time), array[]::uuid[])
    into v_affected_ids
    from public.events
    where (id = v_template.id or series_id = v_series.id)
      and deleted_at is null;
    update public.events
    set deleted_at = v_now,
        purge_after = v_undo_until,
        tombstone_origin = 'user',
        series_revision_applied = v_new_revision,
        updated_at = v_now
    where id = any(v_affected_ids);
    update public.event_series
    set status = 'deleted',
        deleted_at = v_now,
        purge_after = v_undo_until,
        revision = v_new_revision,
        updated_at = v_now
    where id = v_series.id;
    v_operation_type := 'delete_master';
  end if;

  select coalesce((value->>'google_sync_v2')::boolean, false)
  into v_google_sync_enabled
  from public.settings
  where key = 'recurrence_v2_flags';
  v_connection_id := v_series.source_connection_id;
  if v_google_sync_enabled and v_connection_id is not null then
    insert into public.calendar_sync_operations (
      action_id, operation_key, series_id, event_id, connection_id, operation_type,
      casa_revision, payload_snapshot, correlation_id
    ) values (
      p_action_id, p_scope || ':delete', v_series.id,
      case when p_scope = 'this' then v_selected.id else null end,
      v_connection_id, v_operation_type, v_new_revision,
      jsonb_build_object('scope', p_scope, 'mutation_type', 'delete'),
      p_correlation_id
    ) on conflict (action_id, operation_key) do nothing;
  end if;

  v_after := jsonb_build_object(
    'series_id', v_series.id,
    'series_revision', v_new_revision,
    'affected_event_ids', to_jsonb(v_affected_ids),
    'affected_occurrences', coalesce(array_length(v_affected_ids, 1), 0)
      - case when p_scope = 'all' then 1 else 0 end,
    'undo_until', v_undo_until,
    'google_sync_status',
      case when v_google_sync_enabled and v_connection_id is not null then 'pending' else 'not_enabled' end
  );

  insert into public.recurrence_mutation_history (
    action_id, series_id, selected_event_id, scope, mutation_type,
    expected_series_revision, applied_series_revision, actor, correlation_id,
    request_payload, before_state, after_state, status
  ) values (
    p_action_id, v_series.id, v_selected.id, p_scope, 'delete',
    p_expected_series_revision, v_new_revision, p_actor, p_correlation_id,
    jsonb_build_object('series_patch', p_series_patch),
    jsonb_build_object(
      'series', to_jsonb(v_series),
      'template', public.recurrence_build_event_snapshot(v_template.id),
      'selected_occurrence', public.recurrence_build_event_snapshot(v_selected.id)
    ),
    v_after, 'applied'
  ) returning id into v_existing.id;

  return jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'history_id', v_existing.id,
    'series_id', v_series.id,
    'series_revision', v_new_revision,
    'affected_occurrences', v_after->'affected_occurrences',
    'undo_until', v_undo_until,
    'google_sync_status', v_after->>'google_sync_status'
  );
end;
$$;

create or replace function public.recurrence_undo_delete_core(
  p_action_id text,
  p_delete_history_id uuid,
  p_expected_series_revision bigint,
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
  v_delete public.recurrence_mutation_history%rowtype;
  v_series public.event_series%rowtype;
  v_affected_ids uuid[];
  v_new_revision bigint;
  v_connection_id uuid;
  v_google_sync_enabled boolean := false;
  v_operation_type text;
  v_after jsonb;
begin
  if nullif(btrim(p_action_id), '') is null then raise exception 'action_id is required'; end if;
  if nullif(btrim(p_correlation_id), '') is null then raise exception 'correlation_id is required'; end if;

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
      'restored_occurrences', coalesce((v_existing.after_state->>'restored_occurrences')::integer, 0),
      'google_sync_status', v_existing.after_state->>'google_sync_status'
    );
  end if;

  select * into v_delete
  from public.recurrence_mutation_history
  where id = p_delete_history_id
  for update;
  if not found or v_delete.mutation_type <> 'delete' or v_delete.status <> 'applied' then
    raise exception 'Recoverable recurring deletion not found';
  end if;
  if v_delete.undone_at is not null then raise exception 'This recurring deletion was already undone'; end if;
  if coalesce((v_delete.after_state->>'undo_until')::timestamptz, v_delete.created_at + interval '30 days') <= now() then
    raise exception 'The 30-day Undo window has expired';
  end if;

  select * into v_series
  from public.event_series
  where id = v_delete.series_id
  for update;
  if not found then raise exception 'Recurring series is no longer recoverable'; end if;
  if p_expected_series_revision is distinct from v_series.revision then
    raise exception 'Recurring series changed: expected revision %, current revision %',
      p_expected_series_revision, v_series.revision;
  end if;
  if v_series.ownership = 'read_only_import' then
    raise exception 'Read-only recurring series must be adopted before restoring';
  end if;

  select coalesce(array_agg(trim(both '"' from value::text)::uuid), array[]::uuid[])
  into v_affected_ids
  from jsonb_array_elements(v_delete.after_state->'affected_event_ids');
  if coalesce(array_length(v_affected_ids, 1), 0) = 0 then
    raise exception 'Recurring deletion has no recoverable events';
  end if;
  v_new_revision := v_series.revision + 1;

  if v_delete.scope = 'this' then
    update public.events
    set deleted_at = null,
        purge_after = null,
        tombstone_origin = null,
        series_revision_applied = v_new_revision,
        updated_at = now()
    where id = any(v_affected_ids)
      and deleted_at is not null;
    v_operation_type := 'restore_instance';
  elsif v_delete.scope = 'future' then
    update public.event_series
    set recurrence_lines = v_delete.before_state->'series'->'recurrence_lines',
        updated_at = now()
    where id = v_series.id;
    update public.events
    set deleted_at = null,
        purge_after = null,
        tombstone_origin = null,
        series_revision_applied = v_new_revision,
        updated_at = now()
    where id = any(v_affected_ids)
      and deleted_at is not null;
    v_operation_type := 'patch_master';
  else
    update public.event_series
    set status = 'active',
        deleted_at = null,
        purge_after = null,
        recurrence_lines = v_delete.before_state->'series'->'recurrence_lines',
        updated_at = now()
    where id = v_series.id;
    update public.events
    set deleted_at = null,
        purge_after = null,
        tombstone_origin = null,
        series_revision_applied = v_new_revision,
        updated_at = now()
    where id = any(v_affected_ids)
      and deleted_at is not null;
    v_operation_type := 'recreate_projection';
  end if;

  update public.event_series
  set revision = v_new_revision, updated_at = now()
  where id = v_series.id;

  select coalesce((value->>'google_sync_v2')::boolean, false)
  into v_google_sync_enabled
  from public.settings
  where key = 'recurrence_v2_flags';
  v_connection_id := v_series.source_connection_id;
  if v_google_sync_enabled and v_connection_id is not null then
    insert into public.calendar_sync_operations (
      action_id, operation_key, series_id, event_id, connection_id, operation_type,
      casa_revision, payload_snapshot, correlation_id
    ) values (
      p_action_id, v_delete.scope || ':restore', v_series.id,
      case when v_delete.scope = 'this' then v_delete.selected_event_id else null end,
      v_connection_id, v_operation_type, v_new_revision,
      jsonb_build_object(
        'scope', v_delete.scope,
        'mutation_type', 'restore',
        'reverted_history_id', v_delete.id
      ),
      p_correlation_id
    ) on conflict (action_id, operation_key) do nothing;
  end if;

  v_after := jsonb_build_object(
    'series_id', v_series.id,
    'series_revision', v_new_revision,
    'restored_event_ids', to_jsonb(v_affected_ids),
    'restored_occurrences', coalesce(array_length(v_affected_ids, 1), 0)
      - case when v_delete.scope = 'all' then 1 else 0 end,
    'google_sync_status',
      case when v_google_sync_enabled and v_connection_id is not null then 'pending' else 'not_enabled' end
  );
  insert into public.recurrence_mutation_history (
    action_id, series_id, selected_event_id, scope, mutation_type,
    expected_series_revision, applied_series_revision, actor, correlation_id,
    request_payload, before_state, after_state, status, reverted_history_id
  ) values (
    p_action_id, v_series.id, v_delete.selected_event_id, v_delete.scope, 'restore',
    p_expected_series_revision, v_new_revision, p_actor, p_correlation_id,
    jsonb_build_object('delete_history_id', v_delete.id),
    jsonb_build_object('delete_after_state', v_delete.after_state),
    v_after, 'applied', v_delete.id
  ) returning id into v_existing.id;

  update public.recurrence_mutation_history
  set undone_at = now(), undone_by_history_id = v_existing.id
  where id = v_delete.id;

  return jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'history_id', v_existing.id,
    'series_id', v_series.id,
    'series_revision', v_new_revision,
    'restored_occurrences', v_after->'restored_occurrences',
    'google_sync_status', v_after->>'google_sync_status'
  );
end;
$$;

create or replace function public.recurrence_purge_deleted_core()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delete public.recurrence_mutation_history%rowtype;
  v_series public.event_series%rowtype;
  v_affected_ids uuid[];
  v_purged_events integer := 0;
  v_purged_series integer := 0;
  v_count integer;
begin
  for v_delete in
    select *
    from public.recurrence_mutation_history
    where mutation_type = 'delete'
      and status = 'applied'
      and undone_at is null
      and coalesce((after_state->>'undo_until')::timestamptz, created_at + interval '30 days') <= now()
    order by created_at
    for update skip locked
  loop
    select * into v_series
    from public.event_series
    where id = v_delete.series_id;
    if not found then continue; end if;
    if v_series.source_connection_id is not null and not exists (
      select 1
      from public.calendar_sync_operations operation
      where operation.action_id = v_delete.action_id
        and operation.status = 'succeeded'
    ) then
      continue;
    end if;
    select coalesce(array_agg(trim(both '"' from value::text)::uuid), array[]::uuid[])
    into v_affected_ids
    from jsonb_array_elements(v_delete.after_state->'affected_event_ids');

    if v_delete.scope = 'all' then
      if v_series.status <> 'deleted' then continue; end if;
      delete from public.events
      where series_id = v_series.id
        and id = any(v_affected_ids)
        and deleted_at is not null
        and purge_after <= now();
      get diagnostics v_count = row_count;
      v_purged_events := v_purged_events + v_count;
      delete from public.event_series where id = v_series.id and status = 'deleted';
      if found then
        v_purged_series := v_purged_series + 1;
        delete from public.events
        where id = v_series.template_event_id
          and deleted_at is not null
          and purge_after <= now();
        get diagnostics v_count = row_count;
        v_purged_events := v_purged_events + v_count;
      end if;
    else
      delete from public.events
      where id = any(v_affected_ids)
        and deleted_at is not null
        and purge_after <= now();
      get diagnostics v_count = row_count;
      v_purged_events := v_purged_events + v_count;
    end if;
  end loop;
  return jsonb_build_object('purged_events', v_purged_events, 'purged_series', v_purged_series);
end;
$$;

revoke all on function public.recurrence_delete_scoped_core(
  text, uuid, text, bigint, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.recurrence_delete_scoped_core(
  text, uuid, text, bigint, jsonb, jsonb, text
) to service_role;

revoke all on function public.recurrence_undo_delete_core(
  text, uuid, bigint, jsonb, text
) from public, anon, authenticated;
grant execute on function public.recurrence_undo_delete_core(
  text, uuid, bigint, jsonb, text
) to service_role;

revoke all on function public.recurrence_purge_deleted_core()
from public, anon, authenticated;
grant execute on function public.recurrence_purge_deleted_core()
to service_role;

do $$
declare
  v_job record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job in select jobid from cron.job where jobname = 'recurrence-v2-purge-deleted' loop
      perform cron.unschedule(v_job.jobid);
    end loop;
    perform cron.schedule(
      'recurrence-v2-purge-deleted',
      '17 4 * * *',
      'select public.recurrence_purge_deleted_core()'
    );
  end if;
end;
$$;
