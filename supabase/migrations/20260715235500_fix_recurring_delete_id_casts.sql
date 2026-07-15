do $$
declare
  v_signature text;
  v_definition text;
  v_fixed text;
begin
  foreach v_signature in array array[
    'public.recurrence_undo_delete_core(text,uuid,bigint,jsonb,text)',
    'public.recurrence_purge_deleted_core()'
  ]
  loop
    select pg_get_functiondef(v_signature::regprocedure)
    into v_definition;
    v_fixed := replace(
      v_definition,
      'value::text::uuid',
      'trim(both ''"'' from value::text)::uuid'
    );
    if v_fixed <> v_definition then
      execute v_fixed;
    end if;
  end loop;
end;
$$;
