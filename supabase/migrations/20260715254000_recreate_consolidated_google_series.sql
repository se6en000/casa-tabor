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
    '''patch_master'', v_new_revision,',
    '''recreate_projection'', v_new_revision,'
  );
  if v_revised_definition = v_definition then
    raise exception 'Could not locate the linked-family Google operation type';
  end if;
  execute v_revised_definition;
end;
$$;
