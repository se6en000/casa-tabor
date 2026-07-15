do $$
declare
  v_signature text;
  v_definition text;
  v_fixed text;
begin
  foreach v_signature in array array[
    'public.recurrence_delete_scoped_core(text,uuid,text,bigint,jsonb,jsonb,text)',
    'public.recurrence_undo_delete_core(text,uuid,bigint,jsonb,text)'
  ]
  loop
    select pg_get_functiondef(v_signature::regprocedure)
    into v_definition;
    v_fixed := regexp_replace(
      v_definition,
      '\s+using\s+errcode\s*=\s*''40001'';',
      ';',
      'gi'
    );
    if v_fixed <> v_definition then
      execute v_fixed;
    end if;
  end loop;
end;
$$;
