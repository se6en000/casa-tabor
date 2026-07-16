do $$
declare
  v_signature regprocedure :=
    'public.recurrence_apply_scoped_mutation_core(text,uuid,text,text,bigint,text[],jsonb,jsonb,jsonb,text)'::regprocedure;
  v_definition text;
  v_revised_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_revised_definition := replace(
    v_definition,
    '  select * into v_selected from public.events where id = p_selected_event_id;',
    $body$  if p_scope = 'all'
    and p_mutation_type = 'update'
    and jsonb_typeof(p_series_patch->'recurrence_lines') is distinct from 'array'
  then
    raise exception 'Entire series updates require recurrence_lines';
  end if;

  select * into v_selected from public.events where id = p_selected_event_id;$body$
  );
  if v_revised_definition = v_definition then
    raise exception 'Could not install the entire-series recurrence guard';
  end if;
  execute v_revised_definition;
end;
$$;
