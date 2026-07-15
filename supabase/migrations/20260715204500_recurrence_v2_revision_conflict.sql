do $$
declare
  v_signature regprocedure := 'public.recurrence_apply_scoped_mutation_core(text,uuid,text,text,bigint,text[],jsonb,jsonb,jsonb,text)'::regprocedure;
  v_definition text;
  v_revised_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_revised_definition := replace(
    v_definition,
    'errcode = ''40001''',
    'errcode = ''P0001'', detail = ''RECURRENCE_REVISION_CONFLICT'''
  );

  if v_revised_definition = v_definition then
    raise exception 'Could not locate the recurrence revision conflict SQLSTATE';
  end if;

  execute v_revised_definition;
end;
$$;

comment on function public.recurrence_apply_scoped_mutation_core(
  text, uuid, text, text, bigint, text[], jsonb, jsonb, jsonb, text
) is
  'Service-role recurrence command. Revision conflicts use RECURRENCE_REVISION_CONFLICT instead of retryable SQLSTATE 40001.';
