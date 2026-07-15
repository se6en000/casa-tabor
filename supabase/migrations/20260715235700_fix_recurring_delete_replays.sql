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
    '''affected_occurrences'', COALESCE(jsonb_array_length(v_existing.after_state -> ''affected_event_ids''::text), 0)',
    '''affected_occurrences'', COALESCE((v_existing.after_state ->> ''affected_occurrences''::text)::integer, 0)'
  );
  if v_fixed <> v_definition then execute v_fixed; end if;

  select pg_get_functiondef(
    'public.recurrence_undo_delete_core(text,uuid,bigint,jsonb,text)'::regprocedure
  ) into v_definition;
  v_fixed := replace(
    v_definition,
    '''series_revision'', v_existing.applied_series_revision)',
    '''series_revision'', v_existing.applied_series_revision, ''restored_occurrences'', COALESCE((v_existing.after_state ->> ''restored_occurrences''::text)::integer, 0), ''google_sync_status'', v_existing.after_state ->> ''google_sync_status''::text)'
  );
  v_fixed := replace(
    v_fixed,
    '''restored_event_ids'', to_jsonb(v_affected_ids), ''google_sync_status''',
    '''restored_event_ids'', to_jsonb(v_affected_ids), ''restored_occurrences'', COALESCE(array_length(v_affected_ids, 1), 0) - CASE WHEN v_delete.scope = ''all''::text THEN 1 ELSE 0 END, ''google_sync_status'''
  );
  v_fixed := replace(
    v_fixed,
    '''restored_occurrences'', COALESCE(array_length(v_affected_ids, 1), 0) - CASE WHEN v_delete.scope = ''all''::text THEN 1 ELSE 0 END, ''google_sync_status'', v_after ->> ''google_sync_status''::text',
    '''restored_occurrences'', v_after -> ''restored_occurrences''::text, ''google_sync_status'', v_after ->> ''google_sync_status''::text'
  );
  if v_fixed <> v_definition then execute v_fixed; end if;
end;
$$;
