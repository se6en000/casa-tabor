do $$
declare
  v_definition text;
  v_fixed text;
begin
  select pg_get_functiondef(
    'public.recurrence_delete_scoped_core(text,uuid,text,bigint,jsonb,jsonb,text)'::regprocedure
  ) into v_definition;
  v_fixed := replace(
    v_definition,
    $find$'affected_occurrences', coalesce(jsonb_array_length(v_existing.after_state->'affected_event_ids'), 0)$find$,
    $replace$'affected_occurrences', coalesce((v_existing.after_state->>'affected_occurrences')::integer, 0)$replace$
  );
  if v_fixed = v_definition
    and position(
      $desired$'affected_occurrences', coalesce((v_existing.after_state->>'affected_occurrences')::integer, 0)$desired$
      in v_definition
    ) = 0
  then
    raise exception 'Could not update recurring delete replay metadata';
  end if;
  if v_fixed <> v_definition then execute v_fixed; end if;

  select pg_get_functiondef(
    'public.recurrence_undo_delete_core(text,uuid,bigint,jsonb,text)'::regprocedure
  ) into v_definition;
  v_fixed := replace(
    v_definition,
    $find$'series_revision', v_existing.applied_series_revision
    );$find$,
    $replace$'series_revision', v_existing.applied_series_revision,
      'restored_occurrences', coalesce((v_existing.after_state->>'restored_occurrences')::integer, 0),
      'google_sync_status', v_existing.after_state->>'google_sync_status'
    );$replace$
  );
  v_fixed := replace(
    v_fixed,
    $find$'restored_event_ids', to_jsonb(v_affected_ids),
    'google_sync_status',$find$,
    $replace$'restored_event_ids', to_jsonb(v_affected_ids),
    'restored_occurrences', coalesce(array_length(v_affected_ids, 1), 0)
      - case when v_delete.scope = 'all' then 1 else 0 end,
    'google_sync_status',$replace$
  );
  v_fixed := replace(
    v_fixed,
    $find$'restored_occurrences', coalesce(array_length(v_affected_ids, 1), 0)
      - case when v_delete.scope = 'all' then 1 else 0 end,
    'google_sync_status', v_after->>'google_sync_status'$find$,
    $replace$'restored_occurrences', v_after->'restored_occurrences',
    'google_sync_status', v_after->>'google_sync_status'$replace$
  );
  if v_fixed = v_definition
    and position(
      $desired$'restored_occurrences', coalesce((v_existing.after_state->>'restored_occurrences')::integer, 0)$desired$
      in v_definition
    ) = 0
  then
    raise exception 'Could not update recurring Undo replay metadata';
  end if;
  if v_fixed <> v_definition then execute v_fixed; end if;
end;
$$;
